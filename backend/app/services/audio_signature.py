"""
Content-based validation of uploaded audio (no external tools, no decoding).

The extension and the browser-declared content type are client-controlled, so
they prove nothing. This module inspects the first bytes of the file itself
and recognises the four container families the pipeline supports:

  wav  - RIFF/RF64 "WAVE" with a sane `fmt ` chunk
  mp3  - ID3v2-tagged MPEG audio, or a raw stream of consecutive valid MPEG
         audio frames (two frames must chain, which random data almost never
         satisfies)
  aac  - raw ADTS stream (what a ".aac" file normally is)
  m4a  - ISO base media (MP4/M4A/3GP) with an audio-capable `ftyp` brand

Only the *content* decides: a real AAC/M4A recording is accepted whichever of
".aac"/".m4a" it is named, and an MP3 that was saved as ".wav" is still valid
audio the transcriber can read. What is rejected is anything that is not one
of these containers: text, images, archives, executables, OGG/FLAC (an
unsupported container), and random/corrupt bytes.

Nothing here executes, parses deeply, or trusts the file: it reads a bounded
prefix and looks at fixed offsets.
"""

# ----------------------------------------------------------------------
# WAV
# ----------------------------------------------------------------------

def _is_wav(head: bytes) -> bool:

    if len(head) < 12 or head[:4] not in (b"RIFF", b"RF64") or head[8:12] != b"WAVE":
        return False

    position = 12

    while position + 8 <= len(head):

        chunk_id = head[position:position + 4]
        size = int.from_bytes(head[position + 4:position + 8], "little")

        if chunk_id == b"fmt ":

            if size < 16 or position + 8 + 16 > len(head):
                return False

            body = head[position + 8:position + 24]
            audio_format = int.from_bytes(body[0:2], "little")
            channels = int.from_bytes(body[2:4], "little")
            sample_rate = int.from_bytes(body[4:8], "little")

            return audio_format != 0 and 1 <= channels <= 64 and sample_rate > 0

        position += 8 + size + (size & 1)

    return False


# ----------------------------------------------------------------------
# MPEG audio (MP3)
# ----------------------------------------------------------------------

_MPEG_BITRATES = {
    # (version, layer) -> kbps table, index 1..14 (0 = free format, 15 = invalid)
    ("1", 1): [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    ("1", 2): [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    ("1", 3): [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    ("2", 1): [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    ("2", 2): [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    ("2", 3): [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}

_MPEG_SAMPLE_RATES = {
    "1": [44100, 48000, 32000],
    "2": [22050, 24000, 16000],
    "2.5": [11025, 12000, 8000],
}


def _mpeg_frame_length(data: bytes, offset: int):
    """Length in bytes of the MPEG audio frame at `offset`, or None."""

    if offset < 0 or offset + 4 > len(data):
        return None

    if data[offset] != 0xFF or (data[offset + 1] & 0xE0) != 0xE0:
        return None

    version_bits = (data[offset + 1] >> 3) & 0x3
    layer_bits = (data[offset + 1] >> 1) & 0x3

    if version_bits == 1 or layer_bits == 0:          # reserved values
        return None

    version = {3: "1", 2: "2", 0: "2.5"}[version_bits]
    layer = {3: 1, 2: 2, 1: 3}[layer_bits]

    bitrate_index = data[offset + 2] >> 4
    sample_rate_index = (data[offset + 2] >> 2) & 0x3
    padding = (data[offset + 2] >> 1) & 0x1

    if bitrate_index in (0, 15) or sample_rate_index == 3:
        return None

    table_version = "1" if version == "1" else "2"
    bitrate = _MPEG_BITRATES[(table_version, layer)][bitrate_index] * 1000
    sample_rate = _MPEG_SAMPLE_RATES[version][sample_rate_index]

    if layer == 1:
        return (12 * bitrate // sample_rate + padding) * 4

    if layer == 3 and version != "1":
        return 72 * bitrate // sample_rate + padding

    return 144 * bitrate // sample_rate + padding


def _mpeg_frames_chain(data: bytes, start: int, scan: int) -> bool:
    """True if a valid MPEG frame at/after `start` is followed by another."""

    end = min(len(data) - 4, start + scan)

    for offset in range(start, max(start, end) + 1):

        length = _mpeg_frame_length(data, offset)

        if length and length >= 4:

            following = offset + length

            # Frame runs past the sample we were given: cannot chain-check,
            # a single valid header is all the evidence available.
            if following + 4 > len(data):
                return offset == start

            if _mpeg_frame_length(data, following):
                return True

    return False


# ----------------------------------------------------------------------
# ADTS (raw AAC)
# ----------------------------------------------------------------------

def _adts_frame_length(data: bytes, offset: int):

    if offset < 0 or offset + 7 > len(data):
        return None

    # 12-bit sync word 0xFFF followed by layer == 00
    if data[offset] != 0xFF or (data[offset + 1] & 0xF6) != 0xF0:
        return None

    if ((data[offset + 2] >> 2) & 0xF) >= 13:         # sampling frequency index
        return None

    length = ((data[offset + 3] & 0x3) << 11) | (data[offset + 4] << 3) | (data[offset + 5] >> 5)

    return length if length >= 7 else None


def _is_adts(data: bytes, start: int = 0) -> bool:

    length = _adts_frame_length(data, start)

    if not length:
        return False

    following = start + length

    if following + 7 > len(data):
        return True                                    # single (short) frame

    return _adts_frame_length(data, following) is not None


# ----------------------------------------------------------------------
# ID3v2 (prefix used by MP3, and sometimes AAC)
# ----------------------------------------------------------------------

def _id3_tag_end(head: bytes):
    """Offset just past an ID3v2 tag, or None if `head` doesn't start with one."""

    if len(head) < 10 or head[:3] != b"ID3":
        return None

    if head[3] not in (2, 3, 4) or head[4] == 0xFF or any(b >= 0x80 for b in head[6:10]):
        return None

    size = (head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9]
    footer = 10 if (head[5] & 0x10) else 0

    return 10 + size + footer


def _after_id3(head: bytes) -> str | None:

    end = _id3_tag_end(head)

    if end is None:
        return None

    # Tag larger than the sample we hold: nothing more to verify.
    if end + 4 > len(head):
        return "mp3"

    position = end

    while position < len(head) and head[position] == 0:   # padding after the tag
        position += 1

    if _mpeg_frame_length(head, position):
        return "mp3"

    if _is_adts(head, position):
        return "aac"

    return None


# ----------------------------------------------------------------------
# ISO base media (M4A / MP4 / 3GP)
# ----------------------------------------------------------------------

_AUDIO_BRANDS = {
    b"M4A ", b"M4B ", b"M4P ", b"mp41", b"mp42", b"isom", b"iso2", b"iso3",
    b"iso4", b"iso5", b"iso6", b"avc1", b"dash", b"3gp4", b"3gp5", b"3gp6",
    b"3gp7", b"3g2a", b"3g2b", b"3g2c", b"qt  ", b"f4a ", b"MSNV", b"NDAS",
    b"mmp4",
}

_LEADING_BOXES = {b"moov", b"mdat", b"free", b"wide", b"skip"}


def _printable_box_type(data: bytes) -> bool:
    return len(data) == 4 and all(0x20 <= b < 0x7F for b in data)


def _is_iso_media(head: bytes) -> bool:

    if len(head) < 12:
        return False

    size = int.from_bytes(head[0:4], "big")
    box_type = head[4:8]

    if box_type == b"ftyp":

        # A real ftyp box is small and completely present at the start of the
        # file; a stub that declares more bytes than exist is truncated/corrupt.
        if not (12 <= size <= min(len(head), 4096)) or head[8:12] not in _AUDIO_BRANDS:
            return False

        # If the next box header is inside the sample it must look like one.
        if size + 8 <= len(head):
            return _printable_box_type(head[size + 4:size + 8])

        return True

    return box_type in _LEADING_BOXES and (size >= 8 or size == 1)


# ----------------------------------------------------------------------
# Public API
# ----------------------------------------------------------------------

def detect_audio_format(head: bytes):
    """
    Return "wav" | "mp3" | "aac" | "m4a" for a supported audio container,
    or None when `head` (the first bytes of the file) is not one.
    """

    if not head:
        return None

    if _is_wav(head):
        return "wav"

    if _is_iso_media(head):
        return "m4a"

    tagged = _after_id3(head)

    if tagged:
        return tagged

    if _is_adts(head, 0):
        return "aac"

    if _mpeg_frames_chain(head, 0, scan=4096):
        return "mp3"

    return None
