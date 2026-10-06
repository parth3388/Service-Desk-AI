"""/ai/analyze was unauthenticated, unused by the app, and spent the server's
Groq key. It has been removed; these tests keep it from coming back."""

from conftest import auth_headers


def test_ai_analyze_endpoint_no_longer_exists(client, employee, manager, groq):
    body = {"transcript": "hello there this is a test transcript"}

    assert client.post("/ai/analyze", json=body).status_code == 404
    assert client.post("/ai/analyze", json=body, headers=auth_headers(employee)).status_code == 404
    assert client.post("/ai/analyze", json=body, headers=auth_headers(manager)).status_code == 404

    assert groq.calls == []


def test_no_ai_routes_are_registered(client):
    paths = client.get("/openapi.json").json()["paths"]

    assert not [p for p in paths if p.startswith("/ai")]
