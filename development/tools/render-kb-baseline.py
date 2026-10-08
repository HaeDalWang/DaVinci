"""Render local KB baseline XML through the existing Orca draw.io probe.

Usage: python3 development/tools/render-kb-baseline.py <result-dir> <browser-page-id>
Start Vite on localhost:5184 and open development/tools/drawio-probe.html first.
"""
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import urllib.parse
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[2]
output = Path(sys.argv[1]).resolve()
page_id = sys.argv[2]
private = output / "private.local"
baseline_data = (output / "baseline.json").read_bytes()
report = json.loads(baseline_data)
sources = [output / r["xmlFile"] for r in report["records"] if r["status"] == "measured"]
expected_hashes = {r["xmlFile"]: r["outputSha256"] for r in report["records"] if r["status"] == "measured"}
assert sources, "Run the KB measurement first."
assert all(source.is_relative_to(private) and source.is_file() for source in sources)
for source in sources:
    assert hashlib.sha256(source.read_bytes()).hexdigest() == expected_hashes[source.relative_to(output).as_posix()], "XML differs from baseline hash"
svg_dir = private / "svg"
svg_dir.mkdir(exist_ok=False)
proofs = []
roundtrips = []
roundtrip_dir = private / "roundtrip"
roundtrip_dir.mkdir(exist_ok=False)
for source in sources:
    url = "/" + urllib.parse.quote(source.relative_to(root).as_posix())
    expression = r"""(async () => {
      const probe = window.baselineProbe;
      if (!probe?.ready) throw new Error('Draw.io probe is not ready');
      const response = await fetch(INPUT_URL);
      if (!response.ok) throw new Error('Local XML fetch failed');
      const xml = await response.text();
      const fetchedSourceSha256 = Array.from(new Uint8Array(await crypto.subtle.digest(
        'SHA-256', new TextEncoder().encode(xml))), b => b.toString(16).padStart(2, '0')).join('');
      const loadedAt = await new Promise((resolve, reject) => {
        const onLoad = event => {
          if (event.origin !== 'https://embed.diagrams.net' ||
              event.source !== document.querySelector('iframe').contentWindow) return;
          try { if (JSON.parse(event.data).event !== 'load') return; } catch { return; }
          clearTimeout(timer);
          window.removeEventListener('message', onLoad);
          resolve(new Date().toISOString());
        };
        window.addEventListener('message', onLoad);
        const timer = setTimeout(() => {
          window.removeEventListener('message', onLoad);
          reject(new Error('Draw.io load timeout'));
        }, 15000);
        probe.bridge.loadXml(xml);
      });
      let roundtrip;
      if (INPUT_URL.includes('-whole-original.drawio')) {
        const {measureXml, comparePreservation} = await import('/scripts/layout-metrics.js');
        const exportedXml = await probe.bridge.exportDiagram('xml');
        const parser = new DOMParser(), serializer = new XMLSerializer();
        const before = [...parser.parseFromString(xml, 'application/xml').querySelectorAll('diagram')];
        const after = [...parser.parseFromString(exportedXml.xml, 'application/xml').querySelectorAll('diagram')];
        roundtrip = {
          xml: exportedXml.xml, exportedAt: new Date().toISOString(),
          sourcePageCount: before.length, exportPageCount: after.length,
          pageIdentityOrderPreserved: before.length === after.length && before.every((page, index) =>
            page.id === after[index].id && page.getAttribute('name') === after[index].getAttribute('name')),
          pages: before.map((page, index) => {
            const a = measureXml(serializer.serializeToString(page.querySelector('mxGraphModel')));
            const b = measureXml(serializer.serializeToString(after[index].querySelector('mxGraphModel')));
            const preservation = comparePreservation(a, b);
            return {id: page.id, input: a.counts, output: b.counts,
              preservationPassed: preservation.preservationPassed};
          }),
        };
      }
      const exported = await probe.bridge.exportDiagram('svg');
      const version = new DOMParser().parseFromString(exported.xml || '', 'application/xml').documentElement?.getAttribute('version');
      return JSON.stringify({data: exported.data, fetchStatus: response.status,
        loadedAt, exportedAt: new Date().toISOString(), roundtrip, fetchedSourceSha256,
        drawioVersion: /^\d+(\.\d+){1,3}$/.test(version || '') ? version : null});
    })()""".replace("INPUT_URL", json.dumps(url))
    run = subprocess.run(
        ["orca", "eval", "--page", page_id, "--expression", expression, "--json"],
        capture_output=True, text=True, timeout=45, check=True,
    )
    receipt = json.loads(run.stdout)
    assert receipt.get("ok"), "Orca SVG export failed"
    exported = json.loads(receipt["result"]["result"])
    expected_hash = expected_hashes[source.relative_to(output).as_posix()]
    assert exported["fetchedSourceSha256"] == expected_hash, "Browser fetched different XML"
    roundtrip = exported.pop("roundtrip", None)
    if roundtrip:
        data = roundtrip.pop("xml").encode()
        target = roundtrip_dir / source.name
        target.write_bytes(data)
        assert roundtrip["pageIdentityOrderPreserved"]
        assert all(page["preservationPassed"] for page in roundtrip["pages"])
        roundtrips.append({
            "xmlFile": source.relative_to(output).as_posix(),
            "sourceSha256": expected_hash,
            "exportFile": target.relative_to(output).as_posix(),
            "exportSha256": hashlib.sha256(data).hexdigest(),
            "fetchStatus": exported["fetchStatus"], "loadedAt": exported["loadedAt"], **roundtrip,
        })
    prefix, encoded = exported.pop("data").split(",", 1)
    assert prefix == "data:image/svg+xml;base64", "Unexpected export format"
    data = base64.b64decode(encoded, validate=True)
    svg = ET.fromstring(data)
    assert svg.tag == "{http://www.w3.org/2000/svg}svg"
    bounds = list(map(float, svg.get("viewBox", "").split()))
    assert len(bounds) == 4 and bounds[2] > 0 and bounds[3] > 0, "Empty SVG bounds"
    # Paths have generic fixture IDs; customer labels remain inside private.local.
    target = svg_dir / (source.stem + ".svg")
    assert not target.exists(), "Duplicate XML artifact filename"
    target.write_bytes(data)
    proofs.append({
        "xmlFile": source.relative_to(output).as_posix(),
        "sourceSha256": expected_hash,
        "svgFile": target.relative_to(output).as_posix(),
        "svgSha256": hashlib.sha256(data).hexdigest(),
        "width": svg.get("width"), "height": svg.get("height"),
        "viewBox": svg.get("viewBox"), **exported,
    })
    print(f"Rendered {len(proofs)}/{len(sources)}: {source.stem}", flush=True)
assert len(proofs) == len(sources)
(output / "render-proof.json").write_text(json.dumps({
    "scope": "verified draw.io iframe load event then SVG export; whole-file SVG shows the active page only",
    "browserPageId": page_id, "records": proofs,
    "baselineSha256": hashlib.sha256(baseline_data).hexdigest(), "codeSha": report["codeSha"],
    "sourceSha256": {p: hashlib.sha256((root / p).read_bytes()).hexdigest() for p in
                     ("development/tools/render-kb-baseline.py", "development/tools/drawio-probe.html", "scripts/layout-metrics.js")},
    "skipped": [{k: r[k] for k in ("scope", "input", "variant", "status", "errorCode") if k in r}
                for r in report["records"] if r["status"] != "measured"],
}, indent=2) + "\n")
assert len(roundtrips) == len(report["inputs"])
(output / "roundtrip-proof.json").write_text(json.dumps({
    "scope": "original whole files loaded into real draw.io and exported as uncompressed XML; metric fields and ordered page identity checked",
    "records": roundtrips,
}, indent=2) + "\n")
