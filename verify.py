import urllib.request, json, sys

base = "http://localhost:8765"
ok = True
try:
    t = json.loads(urllib.request.urlopen(base + "/api/trend", timeout=5).read())
    print("trend ok | n=", t["n"], "| hot[0]=", t["hot"][0], "| zones=", list(t["zones"].keys()))
except Exception as e:
    ok = False
    print("trend FAIL:", type(e).__name__, e)

try:
    req = urllib.request.Request(
        base + "/api/generate",
        data=json.dumps({"strategy": "hot", "count": 3}).encode(),
        headers={"Content-Type": "application/json"},
    )
    g = json.loads(urllib.request.urlopen(req, timeout=5).read())
    print("generate(hot) ok | count=", g["count"], "| first=", g["numbers"][0])
except Exception as e:
    ok = False
    print("generate FAIL:", type(e).__name__, e)

try:
    req2 = urllib.request.Request(
        base + "/api/generate",
        data=json.dumps({"strategy": "random", "count": 5}).encode(),
        headers={"Content-Type": "application/json"},
    )
    g2 = json.loads(urllib.request.urlopen(req2, timeout=5).read())
    print("generate(random) ok | count=", g2["count"])
except Exception as e:
    ok = False
    print("random FAIL:", type(e).__name__, e)

try:
    idx = urllib.request.urlopen(base + "/", timeout=5).read().decode()
    print("index served | length=", len(idx), "| hasTitle=", "双色球智能选号" in idx)
except Exception as e:
    ok = False
    print("index FAIL:", type(e).__name__, e)

print("RESULT:", "ALL_OK" if ok else "HAS_ERROR")
