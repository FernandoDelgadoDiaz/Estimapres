/**
 * PDF A4 de PRUEBA de la salida híbrida. Cada página lleva la marca «PRUEBA NO OFICIAL — NO PUBLICAR».
 * No reemplaza al PDF oficial (`utils/exportPDF.ts`) ni habilita publicación. Solo identificadores técnicos.
 */
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type {SalidaUnica} from './orquestador'

export const MARCA_NO_OFICIAL='PRUEBA NO OFICIAL — NO PUBLICAR'

export function generarPDFPrueba(s:SalidaUnica,meta:{sucursal:string;semana:string}):jsPDF{
 const doc=new jsPDF({orientation:'portrait',format:'a4',unit:'mm'})
 const W=doc.internal.pageSize.getWidth()
 const encabezado=()=>{
  doc.setFont('helvetica','bold');doc.setFontSize(12);doc.setTextColor(180,0,0)
  doc.text(MARCA_NO_OFICIAL,W/2,10,{align:'center'})
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(60)
  doc.text(`Laboratorio híbrido · Sucursal ${meta.sucursal} · Semana ${meta.semana} · ${s.version}`,W/2,15,{align:'center'})
  doc.setTextColor(0)
 }
 encabezado()
 const tabla=(titulo:string,head:string[],body:(string|number)[][])=>{
  const y=((doc as unknown as {lastAutoTable?:{finalY:number}}).lastAutoTable?.finalY??18)+6
  doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text(titulo,12,y)
  autoTable(doc,{startY:y+2,head:[head],body:body.length?body:[[ 'Sin datos',...head.slice(1).map(()=>'')]],margin:{left:12,right:12,top:20},
   styles:{fontSize:7,cellPadding:1},headStyles:{fillColor:[90,90,90]},didDrawPage:encabezado})
 }
 tabla('Resumen',['Concepto','Valor'],[
  ['Origen de la propuesta',s.origen??'ninguna (sin candidato válido)'],['Motivo',s.motivoSeleccion],['Estado de B',s.estadoB],
  ['Cobertura POM',s.coberturaPomPct===null?'—':`${s.coberturaPomPct} %`],['Demanda (h)',s.demandaHoras??'—'],['Faltantes (h)',s.faltantesHoras??'—'],
  ['Sobrantes (h)',s.sobrantesHoras??'—'],['Comparabilidad AH2-040',`${s.comparabilidadAH2040.modo??'sin modo'} · ${s.comparabilidadAH2040.activacionDefinitiva}`],
  ['Publicable','NO'],['Hash de entrada',s.hashEntrada??'—']])
 tabla('Horas por persona',['Persona','Rol','Contrato/presencia','Caja','Reservado función','Disponible caja','Restante'],
  s.horasPorEmpleado.map(x=>{const r=x as Record<string,unknown>;return [String(r.id),String(r.rol),String(r.horasContractuales??r.horasPresencia??'—'),String(r.horasCaja),String(r.horasReservadasFuncionHabitual??'—'),String(r.disponibilidadCajaEfectivaHoras??'—'),String(r.disponibilidadCajaRestanteHoras??'—')]}))
 tabla('Faltantes por franja',['Día','Franja','Personas'],s.faltantesPorFranja.map(f=>[f.dia,f.franja,f.personas]))
 tabla('Sobrantes por franja',['Día','Franja','Personas'],s.sobrantesPorFranja.map(f=>[f.dia,f.franja,f.personas]))
 tabla('Conflictos y avisos',['Origen','Código','Detalle'],s.conflictos.map(c=>[c.origen,c.codigo,(c.detalle??'').slice(0,120)]))
 tabla('Condiciones del supervisor',['Id','Modo','Tipo','Persona','Día','Valor'],s.condiciones.solicitadas.map(c=>[c.id,c.modo==='DEBE'?'DEBE':'PREFERIRÍA',c.tipo,c.colaboradorId??'—',c.dia??'—',String(c.valor??'—')]))
 tabla('Disponibilidad de caja EVENTUAL (diagnósticos)',['Persona','Código','Nivel','Bloquea publicación'],s.disponibilidadEventual.diagnosticos.map(d=>[d.colaboradorId,d.codigo,d.nivel,d.bloqueaPublicacion?'sí':'no']))
 tabla('AH2-040: relaciones EVENTUAL ≤ AUX comparable',['EVENTUAL','AUX'],s.comparabilidadAH2040.relaciones.map(r=>[r.eventualId,r.auxId]))
 const n=doc.getNumberOfPages()
 for(let i=1;i<=n;i++){doc.setPage(i);doc.setFontSize(7);doc.text(`Página ${i} de ${n} · ${MARCA_NO_OFICIAL}`,W/2,290,{align:'center'})}
 return doc
}
