"""Dump L*_6, L*_7, arm values and all 23 placements from verify_L8_general.py.

Run from the game folder:  python3 test/make_fixture.py path/to/verify_L8_general.py
Writes test/fixture_L8.json.  Tuples: every sorted 8-tuple with sides <= 9 (ties
allowed), plus 20,000 random sorted tuples to side 10^4, plus the recorded witnesses.
"""
import importlib.util, itertools, json, random, sys
from pathlib import Path

spec = importlib.util.spec_from_file_location("V", sys.argv[1])
V = importlib.util.module_from_spec(spec)
spec.loader.exec_module(V)

tuples = [tuple(sorted(c, reverse=True))
          for c in itertools.combinations_with_replacement(range(1, 10), 8)]
rng = random.Random(1019)
tuples += [tuple(sorted((rng.randint(1, 10**4) for _ in range(8)), reverse=True))
           for _ in range(20000)]
tuples += [(44,40,35,29,25,24,18,16), (44,24,21,20,19,18,17,16), (44,23,22,21,18,17,16,15),
           (44,26,21,19,18,17,16,15), (44,43,38,37,13,12,11,10), (39,38,33,32,12,10,9,9),
           (78,76,66,64,24,20,18,17)]

rows = []
for s in tuples:
    L7 = V.L7(s)
    av = V.arm_values(s)
    place = {}
    for n in V.ARM_NAMES:
        L = max(L7, av[n])
        P = V.PLACERS[n](s, L)
        place[n] = [list(P[i]) for i in range(8)]
    rows.append({"s": list(s), "L6": V.L6(s[:6]), "L7": L7, "arms": av, "place": place})

out = Path(__file__).with_name("fixture_L8.json")
out.write_text(json.dumps({"arm_names": list(V.ARM_NAMES), "rows": rows}))
print(f"wrote {len(rows):,} rows to {out}")
