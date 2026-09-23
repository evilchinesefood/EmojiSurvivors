import json, os, shutil, socket, subprocess, tempfile, time, unittest, urllib.request, urllib.error
from pathlib import Path

class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        cls.prepare()
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]
        cls.url = f"http://127.0.0.1:{port}/api.php"
        cls.log = open(cls.root / "server.log", "w+")
        cls.proc = subprocess.Popen(["php", "-S", f"127.0.0.1:{port}", "-t", str(cls.root)], stdout=cls.log, stderr=cls.log)
        for _ in range(100):
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=.1): break
            except OSError: time.sleep(.02)
        else: raise RuntimeError("PHP test server did not start")

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate(); cls.proc.wait(timeout=5); cls.log.close(); cls.temp.cleanup()

    def req(self, query="", body=None, token=None, raw=None):
        headers = {}
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        if data is not None: headers["Content-Type"] = "application/json"
        if token is not None: headers["Authorization"] = "Bearer " + token
        req = urllib.request.Request(self.url + query, data=data, headers=headers)
        try: r = urllib.request.urlopen(req, timeout=5)
        except urllib.error.HTTPError as e: r=e
        with r:
            content=r.read().decode()
            try: content=json.loads(content)
            except ValueError: pass
            return r.status, content

    @classmethod
    def prepare(cls):
        shutil.copy(Path(__file__).resolve().parents[1] / "Api/Signal.php", cls.root / "api.php")
        (cls.root/"Secret.php").write_text("<?php const IP_SALT = 'test-only';")

    def test_peer_authorization(self):
        self.assertEqual(self.req(body={"a":"create"})[0],426)
        status,host=self.req(body={"a":"create","v":2})
        self.assertEqual(status,200);self.assertEqual(len(host["room"]),6)
        room=host["room"]
        status,guest=self.req(body={"a":"join","v":2,"room":room})
        self.assertEqual(status,200);self.assertNotEqual(guest["peer"],"host")
        def msg(from_,to,token):
            return self.req(body={"a":"msg","room":room,"from":from_,"to":to,"p":{"t":"hello"}},token=token)
        self.assertEqual(msg("host",guest["peer"],guest["token"])[0],403)
        self.assertEqual(msg(guest["peer"],"host",None)[0],403)
        self.assertEqual(msg(guest["peer"],"host",guest["token"])[0],200)
        query=f"?a=poll&room={room}&for=host&after=0"
        self.assertEqual(self.req(query)[0],403)
        self.assertEqual(self.req(query,token=guest["token"])[0],403)
        status,res=self.req(query,token=host["token"])
        self.assertEqual(status,200);self.assertEqual(res["msgs"][0]["from"],guest["peer"])
        self.assertEqual(msg("host",guest["peer"],host["token"])[0],200)
        self.assertEqual(self.req(f"?a=poll&room={room}&for={guest['peer']}",token=guest["token"])[0],200)
        _,guest2=self.req(body={"a":"join","v":2,"room":room})
        self.assertEqual(msg(guest["peer"],guest2["peer"],guest["token"])[0],403)
        self.assertEqual(self.req(raw=b"x"*65537)[0],413)
        store=(self.root/"SignalData.json").read_text()
        self.assertNotIn(host["token"],store);self.assertNotIn(guest["token"],store)
        # Expired and pre-security rooms must not bypass new authentication.
        data=json.loads(store);data["rooms"][room]["c"]=0
        (self.root/"SignalData.json").write_text(json.dumps(data))
        self.assertEqual(self.req(query,token=host["token"])[0],404)

    def test_browser_client_roundtrip(self):
        # Isolate this test from the previous room's per-IP creation cooldown.
        (self.root/"SignalData.json").write_text('{}')
        module=(Path(__file__).resolve().parents[1]/"Shared/Net/Signal.js").as_uri()
        script="""
import assert from 'node:assert/strict';
const realFetch=globalThis.fetch;
globalThis.fetch=(url,init)=>realFetch(BASE+String(url).replace('/survivors/Api/Signal.php',''),init);
const {signal}=await import(MODULE);
const host=await signal.create();assert.equal(host.ok,true);
const guest=await signal.join(host.room);assert.equal(guest.ok,true);
assert.equal(await signal.send(host.room,guest.peer,'host',{t:'hello'}),true);
await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('No authenticated message delivered')),3000);const p=signal.makePoller(host.room,'host',(from,payload)=>{p.stop();clearTimeout(timeout);assert.equal(from,guest.peer);assert.equal(payload.t,'hello');resolve();});});
console.log('Signaling client authenticated delivery passed');
""".replace('BASE',json.dumps(self.url)).replace('MODULE',json.dumps(module))
        p=subprocess.run(['node','--input-type=module','-e',script],capture_output=True,text=True,timeout=10)
        self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        (self.root/"SignalData.json").write_text('{}')

if __name__ == "__main__": unittest.main()
