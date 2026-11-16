"""Pruebas offline: solo datos ficticios; no conectan a la app ni a Supabase."""
import unittest

from solver import Shift, allowed, catalogue, solve, validate_payload


def fixture(persons=None, demand=None, **updates):
    data = {
        "escenario": "test",
        "input": {
            "demanda": demand if demand is not None else [[0] * 30 for _ in range(7)],
            "colaboradores": persons if persons is not None else [
                {"id": "p", "nombre": "Part Ficticio", "rol": "PART"},
            ],
            "contratos": {"p": {"objetivoSlots": 64, "maximoSlots": 64}},
            "max_francos_dia": 2,
            "apertura_solo_aux": True,
        }
    }
    data["input"].update(updates)
    return data


class ShiftTests(unittest.TestCase):
    def test_catalogues_durations_and_breaks(self):
        full = catalogue("FULL", True)
        self.assertTrue(any(s.kind == "c9" for s in full))
        self.assertTrue(any(s.kind == "c8" for s in full))
        for shift in full:
            if shift.kind.startswith("c"):
                self.assertGreaterEqual(shift.blocks[1][0] - shift.blocks[0][1], 8)
                self.assertGreaterEqual(shift.first, 2)
            self.assertLessEqual(shift.last, 30)
        part = catalogue("PART", True)
        self.assertTrue(all(s.kind == "off" or 8 <= s.hourslots <= 12 for s in part))
        self.assertTrue(all(s.kind == "off" or s.first >= 2 for s in part))

    def test_franco_fijo_y_no_despues_de(self):
        p = {"id": "p", "nombre": "Ejemplo", "rol": "PART"}
        off = Shift("off", ())
        late = Shift("part", ((18, 28),))
        ex = [{"tipo": "franco_dia", "valor": "2", "colaboradorNombre": "Ejemplo"},
              {"tipo": "no_despues_de", "valor": "14:00", "colaboradorNombre": "Ejemplo"}]
        self.assertTrue(allowed(off, 2, p, ex))
        self.assertFalse(allowed(off, 1, p, ex))
        self.assertFalse(allowed(late, 1, p, ex))

    def test_invalid_input_fails_closed(self):
        bad = fixture()
        bad["input"]["demanda"][2].append(0)
        with self.assertRaises(ValueError):
            validate_payload(bad)
        bad = fixture(excepciones=[{"tipo": "no_implementada", "colaboradorNombre": "Part Ficticio"}])
        with self.assertRaises(ValueError):
            validate_payload(bad)


class SolverTests(unittest.TestCase):
    def test_part_exact_hours_and_no_violations(self):
        data = fixture()
        result = solve(data, seconds=12)
        self.assertIn(result["estado"], ("OPTIMAL", "FEASIBLE"))
        jornadas = result["jornadas"]["p"]
        self.assertEqual(sum(len(x["bloques"]) == 0 for x in jornadas), 1)
        slots = sum(b["slot_fin"] - b["slot_inicio"] for j in jornadas for b in j["bloques"])
        self.assertEqual(slots, 64)
        self.assertEqual(result["metricas_cajeros"]["horas_demanda"], 0)

    def test_infeasible_contract_is_not_relaxed(self):
        data = fixture(excepciones=[{
            "tipo": "no_despues_de", "valor": "13:00", "colaboradorNombre": "Part Ficticio"
        }])
        result = solve(data, seconds=12)
        self.assertEqual(result["estado"], "INFEASIBLE")
        self.assertNotIn("jornadas", result)

    def test_timed_solver_never_claims_unproven_optimality(self):
        # Un límite de reloj puede dejar FEASIBLE, no OPTIMAL. No asumir que
        # dos búsquedas incompletas devuelven exactamente el mismo horario.
        demand = [[0] * 30 for _ in range(7)]
        for row in demand:
            for slot in range(3, 20):
                row[slot] = 1
        result = solve(fixture(demand=demand), seconds=2)
        self.assertIn(result["estado"], ("FEASIBLE", "OPTIMAL", "UNKNOWN"))
        if result["estado"] == "UNKNOWN":
            self.assertNotIn("jornadas", result)
        else:
            self.assertEqual(result["optimo_demostrado_solo_cajeros"], result["estado"] == "OPTIMAL")
            self.assertGreaterEqual(result["brecha_absoluta_objetivo"], 0)
            jornadas = result["jornadas"]["p"]
            self.assertEqual(sum(not j["bloques"] for j in jornadas), 1)
            self.assertEqual(sum(b["slot_fin"] - b["slot_inicio"] for j in jornadas for b in j["bloques"]), 64)


if __name__ == "__main__":
    unittest.main()
