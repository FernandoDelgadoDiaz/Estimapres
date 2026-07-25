// Regresión del bug crítico: "los cambios en Colaboradores no se reflejan al
// generar el horario". La app es una SPA (no recarga al navegar), así que el
// cache de roster a nivel de módulo sobrevivía entre pantallas y quedaba fijado
// en la primera carga: la generación de horarios leía el roster previo a las
// ediciones (desactivados que reaparecían, horarios de AUX/eventuales viejos).
// El fix mantiene el cache sincronizado con cada mutación del roster.
import { describe, it, expect, beforeEach } from "vitest";
import {
  cargarGrupoRoster,
  actualizarCacheRoster,
  invalidarCacheRoster,
} from "../almacen";
import type { Colaborador, Eventual } from "../../types";

describe("cache de roster: los cambios en Colaboradores llegan a la generación", () => {
  beforeEach(() => invalidarCacheRoster());

  it("un colaborador desactivado NO entra al input del algoritmo", async () => {
    const roster: Colaborador[] = [
      { id: "1", nombre: "Activo", tipo: "FULL", horasSemanales: 48, activo: true },
      { id: "2", nombre: "Carina Mansilla", tipo: "FULL", horasSemanales: 48, activo: false },
    ];
    // El supervisor desactivó a Carina → el hook sincroniza el cache
    actualizarCacheRoster("cajero", roster);

    // La próxima pantalla (Nueva Semana) carga el roster y filtra los activos
    const cargado = await cargarGrupoRoster<Colaborador>("cajero");
    const activos = cargado.filter((c) => c.activo);

    expect(activos.map((c) => c.nombre)).toEqual(["Activo"]);
    expect(activos.some((c) => c.nombre === "Carina Mansilla")).toBe(false);
  });

  it("un eventual desactivado NO entra al input del algoritmo", async () => {
    const eventuales: Eventual[] = [
      { id: "1", nombre: "Disponible", sector: "Perfumería", horarioSemanal: ["09:00-13:00", "", "", "", "", "", ""], activo: true },
      { id: "2", nombre: "Monica Vazquez", sector: "Perfumería", horarioSemanal: ["09:00-13:00", "", "", "", "", "", ""], activo: false },
    ];
    actualizarCacheRoster("eventual", eventuales);

    const cargado = await cargarGrupoRoster<Eventual>("eventual");
    const activos = cargado.filter((e) => e.activo);

    expect(activos.map((e) => e.nombre)).toEqual(["Disponible"]);
  });

  it("editar el roster reemplaza el snapshot anterior (no queda dato viejo en cache)", async () => {
    actualizarCacheRoster("cajero", [
      { id: "1", nombre: "Viejo", tipo: "FULL", horasSemanales: 48, activo: true },
    ]);
    // El supervisor edita el horario/tipo → nuevo snapshot
    actualizarCacheRoster("cajero", [
      { id: "1", nombre: "Nuevo", tipo: "PART", horasSemanales: 30, activo: true },
    ]);

    const cargado = await cargarGrupoRoster<Colaborador>("cajero");
    expect(cargado).toEqual([
      { id: "1", nombre: "Nuevo", tipo: "PART", horasSemanales: 30, activo: true },
    ]);
  });

  it("el cache clona la lista: mutar el estado del hook después no altera lo cacheado", async () => {
    const roster: Colaborador[] = [
      { id: "1", nombre: "A", tipo: "FULL", horasSemanales: 48, activo: true },
    ];
    actualizarCacheRoster("cajero", roster);
    // El hook sigue viviendo y su array podría mutarse por otra vía
    roster.push({ id: "2", nombre: "Fantasma", tipo: "FULL", horasSemanales: 48, activo: true });

    const cargado = await cargarGrupoRoster<Colaborador>("cajero");
    expect(cargado.map((c) => c.nombre)).toEqual(["A"]);
  });
});
