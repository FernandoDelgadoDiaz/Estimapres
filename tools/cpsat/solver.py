#!/usr/bin/env python3
"""Benchmark OFFLINE CP-SAT: optimiza FULL/PART en 7 días x 30 slots.

No es un servicio, no importa código productivo ni accede a Supabase/Netlify.
El óptimo certificado corresponde SOLO al subproblema FULL/PART modelado;
AUX, eventuales y validación integral permanecen en TypeScript.
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ortools.sat.python import cp_model

DAYS, SLOTS = 7, 30
FULL_COUNTS = {"r9": 1, "r8": 2, "r5": 1, "c9": 2, "c8": 0}
CORTADAS = (("c9", ((8, 10), (10, 8))), ("c8", ((8, 8),)))
KNOWN_EXC = {"franco_dia", "no_antes_de", "no_despues_de", "siempre_cierre", "solo_matutino", "solo_nocturno"}


@dataclass(frozen=True)
class Shift:
    kind: str
    blocks: tuple[tuple[int, int], ...]
    morning: bool = False

    @property
    def hourslots(self) -> int:
        return sum(b - a for a, b in self.blocks)

    @property
    def first(self) -> int:
        return self.blocks[0][0] if self.blocks else 0

    @property
    def last(self) -> int:
        return self.blocks[-1][1] if self.blocks else 0

    def covers(self, slot: int) -> bool:
        return any(a <= slot < b for a, b in self.blocks)


def time_slot(value: str) -> int:
    hour, minute = map(int, value.split(":"))
    if minute not in (0, 30):
        raise ValueError("La hora debe tener precisión de media hora")
    return (hour - 8) * 2 + minute // 30


def catalogue(role: str, apertura_solo_aux: bool) -> list[Shift]:
    shifts: list[Shift] = [Shift("off", ())]
    if role == "FULL":
        for kind, duration, starts in (
            ("r9", 18, ((2, 6), (7, 12))),
            ("r8", 16, ((2, 6), (7, 14))),
            ("r5", 10, ((2, 6), (7, 20))),
        ):
            for lo, hi in starts:
                for start in range(lo, hi + 1):
                    shifts.append(Shift(kind, ((start, start + duration),), lo == 2))
        for kind, compositions in CORTADAS:
            for a, b in compositions:
                for start in range(2 if apertura_solo_aux else 0, 4):
                    second_min = start + a + 8  # Corte mínimo de 4 horas.
                    for second in range(second_min, SLOTS - b + 1):
                        shifts.append(Shift(kind, ((start, start + a), (second, second + b))))
    elif role == "PART":
        for duration in range(8, 13):
            for lo, hi in ((2, 6), (7, SLOTS - duration)):
                for start in range(lo, hi + 1):
                    shifts.append(Shift("part", ((start, start + duration),), lo == 2))
    else:
        raise ValueError(f"Rol no soportado por este benchmark: {role}")
    return shifts


def allowed(shift: Shift, day: int, person: dict[str, Any], exceptions: list[dict[str, Any]]) -> bool:
    for exc in exceptions:
        if exc.get("colaboradorNombre") != person["nombre"]:
            continue
        typ, value = exc["tipo"], exc.get("valor")
        if typ not in KNOWN_EXC:
            raise ValueError(f"Excepción desconocida: {typ}")
        if typ == "franco_dia" and value is not None:
            if (day == int(value)) != (shift.kind == "off"):
                return False
        if shift.kind == "off":
            continue
        if typ == "no_antes_de" and value and shift.first < time_slot(value):
            return False
        if typ == "no_despues_de" and value and shift.last > time_slot(value):
            return False
        if typ == "solo_matutino" and shift.first > 4:
            return False
        if typ == "solo_nocturno" and shift.first < 18:
            return False
        if typ == "siempre_cierre" and not (len(shift.blocks) == 1 and shift.first <= 6) and shift.last < 28:
            return False
    return True


def validate_payload(data: dict[str, Any]) -> dict[str, Any]:
    inp = data.get("input", data)
    demand = inp["demanda"]
    if len(demand) != DAYS or any(len(row) != SLOTS for row in demand):
        raise ValueError("La demanda debe tener 7 días x 30 slots.")
    if any(type(n) is not int or n < 0 for row in demand for n in row):
        raise ValueError("La demanda debe contener enteros no negativos.")
    persons = [p for p in inp["colaboradores"] if p["rol"] in ("FULL", "PART")]
    if len({p["id"] for p in persons}) != len(persons):
        raise ValueError("IDs duplicados.")
    for p in persons:
        if not p.get("nombre"):
            raise ValueError(f"Falta el nombre del colaborador {p['id']}")
    for e in inp.get("excepciones", []):
        if e["tipo"] not in KNOWN_EXC:
            raise ValueError(f"Excepción no implementada: {e['tipo']}")
    return inp


def preference(shift: Shift, day: int, pref: dict[str, Any]) -> int:
    daily = pref.get("porDia", {}).get(str(day), pref.get("porDia", {}).get(day, {}))
    def bounded(value: Any) -> int:
        return max(-12, min(12, round(float(value or 0))))
    if shift.kind == "off":
        return bounded(daily.get("franco", 0))
    key = "cierre" if shift.last >= 28 else "manana" if len(shift.blocks) == 1 and 2 <= shift.first <= 6 else "tarde"
    return bounded(pref.get(key, 0)) + bounded(daily.get(key, 0))


def baseline_summary(demand: list[list[int]], baseline: dict[str, Any]) -> dict[str, Any]:
    coverage = [[0] * SLOTS for _ in range(DAYS)]
    for group in ("jornadas_full", "jornadas_part"):
        for week in baseline.get(group, {}).values():
            for j in week:
                for block in j["bloques"]:
                    for s in range(block["slot_inicio"], block["slot_fin"]):
                        coverage[j["dia"]][s] += 1
    return summarize(demand, coverage)


def summarize(demand: list[list[int]], coverage: list[list[int]]) -> dict[str, Any]:
    deficit = sum(max(demand[d][s] - coverage[d][s], 0) for d in range(DAYS) for s in range(SLOTS))
    excess = sum(max(coverage[d][s] - demand[d][s], 0) for d in range(DAYS) for s in range(SLOTS))
    return {
        "faltantes_horas_cajeros": deficit / 2,
        "sobrantes_horas_cajeros": excess / 2,
        "horas_demanda": sum(map(sum, demand)) / 2,
        "franjas_con_faltante": sum(demand[d][s] > coverage[d][s] for d in range(DAYS) for s in range(SLOTS)),
        "maximo_faltante_franja": max((demand[d][s] - coverage[d][s] for d in range(DAYS) for s in range(SLOTS)), default=0),
    }


def solve(data: dict[str, Any], seconds: float = 60.0, seed: int = 20261114) -> dict[str, Any]:
    inp = validate_payload(data)
    demand = inp["demanda"]
    persons = [p for p in inp["colaboradores"] if p["rol"] in ("FULL", "PART")]
    model = cp_model.CpModel()
    choices: dict[tuple[str, int], list[tuple[Shift, Any]]] = {}
    off: dict[tuple[str, int], Any] = {}
    work: dict[tuple[str, int], Any] = {}
    start: dict[tuple[str, int], Any] = {}
    end: dict[tuple[str, int], Any] = {}
    pref_terms: list[Any] = []
    options = inp.get("excepciones", [])
    contracts = inp.get("contratos", {})
    apertura_aux = inp.get("apertura_solo_aux", True)
    for p in persons:
        ident, role = p["id"], p["rol"]
        shifts = catalogue(role, apertura_aux)
        for day in range(DAYS):
            valid = [x for x in shifts if allowed(x, day, p, options)]
            if not valid:
                return {"escenario": data.get("escenario"), "estado": "INFEASIBLE", "motivo": f"Sin jornadas candidatas para {ident}, día {day}"}
            xs = [(shift, model.NewBoolVar(f"x_{ident}_{day}_{i}")) for i, shift in enumerate(valid)]
            choices[ident, day] = xs
            model.Add(sum(x for _, x in xs) == 1)
            off[ident, day] = next((x for shift, x in xs if shift.kind == "off"), None)
            if off[ident, day] is None:
                # Sin franco posible en este día; NO modelarlo como decisión libre.
                off[ident, day] = model.NewConstant(0)
            work[ident, day] = model.NewBoolVar(f"work_{ident}_{day}")
            model.Add(work[ident, day] + off[ident, day] == 1)
            start[ident, day] = model.NewIntVar(0, 30, f"start_{ident}_{day}")
            end[ident, day] = model.NewIntVar(0, 30, f"end_{ident}_{day}")
            model.Add(start[ident, day] == sum(shift.first * x for shift, x in xs))
            model.Add(end[ident, day] == sum(shift.last * x for shift, x in xs))
            pref = inp.get("preferencias_turno", {}).get(ident, {})
            pref_terms.extend(preference(shift, day, pref) * x for shift, x in xs if preference(shift, day, pref))
            if day:
                model.Add(start[ident, day] + 48 - end[ident, day - 1] >= 24).OnlyEnforceIf(
                    [work[ident, day - 1], work[ident, day]]
                )
        model.Add(sum(off[ident, day] for day in range(DAYS)) == 1)
        model.Add(sum(x for day in range(DAYS) for shift, x in choices[ident, day] if shift.morning) >= 2)

        if role == "FULL":
            model.Add(sum(x for day in range(DAYS) for shift, x in choices[ident, day] if shift.kind in ("c9", "c8")) == 2)
            model.Add(sum(x for day in range(DAYS) for shift, x in choices[ident, day] if shift.hourslots == 18) == 3)
            model.Add(sum(x for day in range(DAYS) for shift, x in choices[ident, day] if shift.hourslots == 16) == 2)
            model.Add(sum(x for day in range(DAYS) for shift, x in choices[ident, day] if shift.hourslots == 10) == 1)
            if inp.get("franco_medio_corridos", False):
                for d in range(DAYS):
                    half = sum(x for shift, x in choices[ident, d] if shift.kind == "r5")
                    neighbors_off = sum(off[ident, i] for i in (d - 1, d + 1) if 0 <= i < DAYS)
                    neighbors_half = sum(
                        x for i in (d - 1, d + 1) if 0 <= i < DAYS for shift, x in choices[ident, i] if shift.kind == "r5"
                    )
                    model.Add(half <= neighbors_off)
                    model.Add(off[ident, d] <= neighbors_half)
        else:
            contract = contracts.get(ident, {})
            max_slots = int(contract.get("maximoSlots", 62))
            target = contract.get("objetivoSlots")
            hours = sum(shift.hourslots * x for d in range(DAYS) for shift, x in choices[ident, d])
            model.Add(hours <= max_slots)
            if target is not None:
                # La benchmark estricta no relaja horas sin una autorización explícita.
                model.Add(hours == min(int(target), max_slots))
        prev_end = inp.get("fin_domingo_anterior", {}).get(ident)
        if prev_end is not None:
            model.Add(start[ident, 0] + 48 - int(prev_end) >= 24).OnlyEnforceIf(work[ident, 0])

    for d in range(DAYS):
        model.Add(sum(off[p["id"], d] for p in persons) <= max(1, int(inp.get("max_francos_dia", 2))))

    weights = inp.get("pesos_franja") or [1] * SLOTS
    if len(weights) != SLOTS or any(type(x) is not int or not 1 <= x <= 20 for x in weights):
        raise ValueError("pesos_franja: 30 enteros 1..20")
    missing: list[Any] = []
    excesses: list[Any] = []
    for d in range(DAYS):
        for s in range(SLOTS):
            coverage = sum(x for p in persons for shift, x in choices[p["id"], d] if shift.covers(s))
            shortage = model.NewIntVar(0, demand[d][s], f"def_{d}_{s}")
            excess = model.NewIntVar(0, len(persons), f"exc_{d}_{s}")
            model.Add(coverage + shortage - excess == demand[d][s])
            missing.append(weights[s] * shortage)
            excesses.append(excess)

    # Objetivo lexicográfico por coeficientes con cotas demostrables.
    # Déficit ponderado > sobrantes > preferencias históricas.
    pref_bound = 24 * DAYS * len(persons)
    cost_excess = 2 * pref_bound + 1
    cost_missing = (DAYS * SLOTS * len(persons) + 1) * cost_excess
    model.Minimize(cost_missing * sum(missing) + cost_excess * sum(excesses) - sum(pref_terms))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = seconds
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = seed
    status = solver.Solve(model)
    state = solver.StatusName(status)
    result: dict[str, Any] = {
        "escenario": data.get("escenario"), "estado": state,
        "alcance": "solo-FULL-PART", "tiempo_segundos": round(solver.WallTime(), 3),
        "semilla": seed, "workers": 1,
        "advertencia": "No certifica el óptimo de Aliada completa: AUX/eventuales y validación TS fuera del modelo.",
    }
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        coverage_matrix = [[0] * SLOTS for _ in range(DAYS)]
        weeks: dict[str, list[dict[str, Any]]] = {}
        for p in persons:
            ident = p["id"]
            weeks[ident] = []
            for d in range(DAYS):
                chosen = next(shift for shift, x in choices[ident, d] if solver.Value(x))
                blocks = [{"slot_inicio": a, "slot_fin": b} for a, b in chosen.blocks]
                weeks[ident].append({"colab_id": ident, "dia": d, "bloques": blocks})
                for s in range(SLOTS):
                    coverage_matrix[d][s] += int(chosen.covers(s))
        result["jornadas"] = weeks
        result["metricas_cajeros"] = summarize(demand, coverage_matrix)
        result["objetivo"] = solver.ObjectiveValue()
        result["cota_inferior_objetivo"] = solver.BestObjectiveBound()
        result["brecha_absoluta_objetivo"] = max(0.0, solver.ObjectiveValue() - solver.BestObjectiveBound())
        result["optimo_demostrado_solo_cajeros"] = status == cp_model.OPTIMAL
    if "baseline" in data:
        result["motor_actual_solo_cajeros"] = baseline_summary(demand, data["baseline"])
        result["baseline_validador_violaciones"] = data.get("baseline_validador_violaciones")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="CP-SAT OFFLINE para Issue #13; nunca usar para publicar horarios")
    parser.add_argument("archivos", nargs="+", type=Path)
    parser.add_argument("--segundos", type=float, default=60.0)
    parser.add_argument("--salida", type=Path)
    args = parser.parse_args()
    out = [solve(json.loads(path.read_text(encoding="utf-8")), args.segundos) for path in args.archivos]
    rendered = json.dumps(out, ensure_ascii=False, indent=2)
    if args.salida:
        args.salida.write_text(rendered + "\n", encoding="utf-8")
    else:
        print(rendered)


if __name__ == "__main__":
    main()
