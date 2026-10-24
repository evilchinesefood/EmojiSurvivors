import json, os, shutil, socket, subprocess, tempfile, time, unittest, urllib.request, urllib.error
from pathlib import Path

class ApiServer(unittest.TestCase):
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

    def req(self, query="", body=None, token=None, raw=None, method=None):
        headers = {}
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        if data is not None: headers["Content-Type"] = "application/json"
        if token is not None: headers["Authorization"] = "Bearer " + token
        req = urllib.request.Request(self.url + query, data=data, headers=headers, method=method)
        try: r = urllib.request.urlopen(req, timeout=5)
        except urllib.error.HTTPError as e: r=e
        with r:
            content=r.read().decode()
            try: content=json.loads(content)
            except ValueError: pass
            return r.status, content

class ApiTest(ApiServer):
    def setUp(self):
        (self.root / "SignalData.json").write_text('{}')

    @classmethod
    def prepare(cls):
        shutil.copy(Path(__file__).resolve().parents[1] / "Api/Signal.php", cls.root / "api.php")
        (cls.root/"Secret.php").write_text("<?php const IP_SALT = 'test-only';")

    def room(self):
        status, host = self.req(body={"a": "create", "v": 2})
        self.assertEqual(status, 200)
        return host

    def join(self, host, token=None):
        return self.req(body={"a": "join", "room": host["room"], "v": 2}, token=token)

    def store(self):
        return json.loads((self.root / "SignalData.json").read_text())

    def write_store(self, data):
        (self.root / "SignalData.json").write_text(json.dumps(data))

    def confirm(self, host, peers, token=None):
        return self.req(body={"a": "confirm", "room": host["room"], "peers": peers}, token=token or host["token"])

    def test_authenticated_reconnect_reuses_identity(self):
        host = self.room()
        _, guest = self.join(host)
        status, again = self.join(host, guest["token"])
        self.assertEqual(status, 200)
        self.assertEqual(again["peer"], guest["peer"])
        self.assertEqual(again["token"], guest["token"])
        self.assertEqual(len(self.store()["rooms"][host["room"]]["peers"]), 2)
        self.assertEqual(self.join(host, '0' * 64)[0], 403)
        self.assertEqual(self.join(host, host["token"])[0], 403)

    def test_pending_admissions_do_not_consume_accepted_seats(self):
        host = self.room()
        guests = [self.join(host)[1] for _ in range(3)]
        self.assertEqual(self.join(host)[0], 429)
        self.assertEqual(self.confirm(host, [guests[0]["peer"]], guests[0]["token"])[0], 403)
        self.assertEqual(self.confirm(host, [g["peer"] for g in guests])[0], 200)
        status, extra = self.join(host)
        self.assertEqual(status, 200)
        self.assertEqual(self.confirm(host, [extra["peer"]])[0], 409)
        self.assertEqual(len(self.store()["rooms"][host["room"]]["peers"]), 5)
        self.assertEqual(self.confirm(host, [g["peer"] for g in guests] + [extra["peer"]])[0], 400)

    def test_pending_expiration_cannot_be_renewed_by_guest(self):
        host = self.room()
        _, guest = self.join(host)
        data = self.store()
        room = data["rooms"][host["room"]]
        room["peerState"] = {guest["peer"]: {"expires": int(time.time()) + 30, "accepted": False, "ip": "fixture-ip"}}
        room["t"] = int(time.time()) - 100
        expiry, touched = room["peerState"][guest["peer"]]["expires"], room["t"]
        self.write_store(data)
        status, again = self.join(host, guest["token"])
        self.assertEqual(status, 200)
        self.req(body={"a":"msg", "room":host["room"], "from":again["peer"], "to":"host", "p":{"t":"hello"}}, token=guest["token"])
        room = self.store()["rooms"][host["room"]]
        self.assertEqual(room["peerState"][guest["peer"]]["expires"], expiry)
        self.assertEqual(room["t"], touched)
        room["peerState"][guest["peer"]]["expires"] = int(time.time()) - 1
        data = self.store(); data["rooms"][host["room"]] = room; self.write_store(data)
        self.assertEqual(self.req(f'?a=poll&room={host["room"]}&for={guest["peer"]}', token=guest["token"])[0], 403)
        self.assertEqual(self.join(host, guest["token"])[0], 403)
        status, replacement = self.join(host)
        self.assertEqual(status, 200)
        room = self.store()["rooms"][host["room"]]
        self.assertNotIn(guest["peer"], room["peers"])
        self.assertTrue(all(m["from"] != guest["peer"] and m["to"] != guest["peer"] for m in room["msgs"]))
        self.assertEqual(room["peers"]["host"], __import__('hashlib').sha256(host["token"].encode()).hexdigest())

    def test_room_pending_cap_recovers_after_expiry_without_removing_accepted_guest(self):
        host = self.room()
        _, accepted = self.join(host)
        self.assertEqual(self.confirm(host, [accepted['peer']])[0], 200)
        data = self.store(); room = data['rooms'][host['room']]
        # Model admissions from distinct IPs to exercise the room-wide ceiling.
        for i in range(12):
            peer = f'pending{i}'
            room['peers'][peer] = '0' * 64
            room['peerState'][peer] = {'expires': int(time.time()) + 30, 'accepted': False, 'ip': f'ip{i}'}
        self.write_store(data)
        self.assertEqual(self.join(host)[0], 429)
        data = self.store(); room = data['rooms'][host['room']]
        for state in room['peerState'].values():
            if not state['accepted']: state['expires'] = int(time.time()) - 1
        self.write_store(data)
        self.assertEqual(self.join(host)[0], 200)
        room = self.store()['rooms'][host['room']]
        self.assertEqual(len(room['peers']), 3)
        self.assertIn(accepted['peer'], room['peers'])

    def test_leave_and_host_release_require_matching_authority(self):
        host = self.room()
        _, guest = self.join(host)
        _, other = self.join(host)
        def leave(peer, token):
            return self.req(body={"a":"leave", "room":host["room"], "peer":peer}, token=token)
        self.assertEqual(leave(other["peer"], guest["token"])[0], 403)
        self.assertEqual(leave('host', guest["token"])[0], 403)
        self.assertEqual(leave(guest["peer"], None)[0], 403)
        self.assertEqual(leave(guest["peer"], guest["token"])[0], 200)
        self.assertNotIn(guest["peer"], self.store()["rooms"][host["room"]]["peers"])
        self.assertEqual(leave(other["peer"], host["token"])[0], 200)
        self.assertEqual(list(self.store()["rooms"][host["room"]]["peers"]), ['host'])
        self.assertEqual(leave('host', host["token"])[0], 200)
        self.assertNotIn(host["room"], self.store()["rooms"])

    def test_confirmed_guest_lease_and_legacy_room_preservation(self):
        host = self.room()
        _, guest = self.join(host)
        data = self.store()
        data["rooms"][host["room"]].pop('peerState', None)
        old_peers = data["rooms"][host["room"]]["peers"].copy()
        self.write_store(data)
        self.assertEqual(self.confirm(host, [guest["peer"]])[0], 200)
        room = self.store()["rooms"][host["room"]]
        self.assertEqual(room['peers'], old_peers)
        self.assertTrue(room['peerState'][guest['peer']]['accepted'])
        room['peerState'][guest['peer']]['expires'] = int(time.time()) + 1
        data = self.store(); data['rooms'][host['room']] = room; self.write_store(data)
        self.assertEqual(self.confirm(host, [guest['peer']])[0], 200)
        self.assertGreater(self.store()['rooms'][host['room']]['peerState'][guest['peer']]['expires'], time.time() + 60)
        data = self.store(); data['rooms'][host['room']]['peerState'][guest['peer']]['expires'] = int(time.time()) - 1; self.write_store(data)
        self.assertEqual(self.req(f'?a=poll&room={host["room"]}&for={guest["peer"]}', token=guest['token'])[0], 403)
        self.assertEqual(self.req(f'?a=poll&room={host["room"]}&for=host', token=host['token'])[0], 200)

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
const [guest,parallel]=await Promise.all([signal.join(host.room),signal.join(host.room)]);assert.equal(guest.ok,true);assert.equal(parallel.peer,guest.peer);
const again=await signal.join(host.room);assert.equal(again.peer,guest.peer);
for(let i=0;i<40;i++) assert.equal((await signal.join(host.room)).peer,guest.peer);
assert.equal(await signal.confirm(host.room,[guest.peer]),true);
assert.equal(await signal.send(host.room,guest.peer,'host',{t:'hello'}),true);
await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('No authenticated message delivered')),3000);const p=signal.makePoller(host.room,'host',(from,payload)=>{p.stop();clearTimeout(timeout);assert.equal(from,guest.peer);assert.equal(payload.t,'hello');resolve();});});
assert.equal(await signal.leave(host.room,guest.peer),true);
const replacement=await signal.join(host.room);assert.notEqual(replacement.peer,guest.peer);
assert.equal(await signal.release(host.room,replacement.peer),true);
const renewed=await signal.join(host.room);assert.equal(renewed.ok,true);assert.notEqual(renewed.peer,replacement.peer);
assert.equal(await signal.leave(host.room,renewed.peer),true);
assert.equal(await signal.leave(host.room,'host'),true);
console.log('Signaling client authenticated delivery passed');
""".replace('BASE',json.dumps(self.url)).replace('MODULE',json.dumps(module))
        p=subprocess.run(['node','--input-type=module','-e',script],capture_output=True,text=True,timeout=10)
        self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        (self.root/"SignalData.json").write_text('{}')

class RetiredBoardTest(ApiServer):
    @classmethod
    def prepare(cls):
        shutil.copy(Path(__file__).resolve().parents[1] / "Api/Leaderboard.php", cls.root / "api.php")
        (cls.root / "Secret.php").write_text("<?php const IP_SALT = 'test-only'; const LB_SALT = 'test-only';")

    def test_retired_endpoint_preserves_stored_records(self):
        historical = '{"boards":{"300:standard:normal":[{"n":"Historical player","kills":42}]}}'
        (self.root / 'LeaderboardData.json').write_text(historical)
        for query, body in [('?board=300:standard:normal', None), ('', {"entry":{"kills":999},"name":"Unverified","sig":"dummy"})]:
            status, response = self.req(query, body)
            self.assertEqual(status, 410)
            self.assertTrue(response['retired'])
            self.assertEqual((self.root / 'LeaderboardData.json').read_text(), historical)
        for method in ['HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']:
            status, response = self.req(method=method)
            self.assertEqual(status, 410)
            if method != 'HEAD': self.assertTrue(response['retired'])
            self.assertEqual((self.root / 'LeaderboardData.json').read_text(), historical)

if __name__ == "__main__": unittest.main()
