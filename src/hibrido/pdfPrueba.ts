/**
 * PDF A4 de PRUEBA de la salida híbrida. Cada página lleva la marca «PRUEBA NO OFICIAL — NO PUBLICAR».
 * No reemplaza al PDF oficial (`utils/exportPDF.ts`) ni habilita publicación. Solo identificadores técnicos.
 */
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type {SalidaUnica} from './orquestador'

export const MARCA_NO_OFICIAL='PRUEBA NO OFICIAL — NO PUBLICAR'
const DIAS=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
const hora=(slot:number)=>{const m=8*60+slot*30;return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`}
/** Tramos contiguos de franjas (índices 0..29, 08:00–23:00) como «HH:MM–HH:MM». */
export function tramos(slots:number[]):string[]{
 const o=[...new Set(slots)].sort((a,b)=>a-b),r:string[]=[]
 for(let i=0;i<o.length;){let j=i;while(j+1<o.length&&o[j+1]===o[j]+1)j++;r.push(`${hora(o[i])}–${hora(o[j]+1)}`);i=j+1}
 return r
}
/** Grilla semanal de caja por persona a partir del plan elegido (FULL/PART: jornada; AUX/EVENTUAL: franjas en caja). */
export function grillaPlan(p:NonNullable<SalidaUnica['propuesta']>):string[][]{
 const filas:string[][]=[]
 for(const [rol,m] of [['FULL',p.jornadas_full],['PART',p.jornadas_part]] as const)for(const [id,js] of Object.entries(m))
  filas.push([id,rol,...DIAS.map((_,d)=>{const j=js.find(x=>x.dia===d);return j&&j.bloques.length?j.bloques.map(b=>`${hora(b.slot_inicio)}–${hora(b.slot_fin)}`).join(' / '):'Franco'})])
 for(const [rol,m] of [['AUX',p.asignacion_aux],['EVENTUAL',p.asignacion_eventual]] as const)for(const [id,w] of Object.entries(m as Record<string,string[][]>))
  filas.push([id,rol,...w.map(row=>{const t=tramos(row.flatMap((v,s)=>v==='CAJA'?[s]:[]));return t.length?`Caja ${t.join(' / ')}`:'—'})])
 return filas
}

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
  ['Excepción apertura AUX único (AH2-037)',s.excepcionApertura.configurada?`configurada · ${s.excepcionApertura.franjasAplicadas} franjas aplicadas`:'no configurada'],
  ['Bloqueos de datos o política',s.bloqueos.length?s.bloqueos.join(', '):'ninguno'],
  ['Publicable','NO'],['Hash de entrada',s.hashEntrada??'—']])
 if(s.propuesta)tabla(`Planificación semanal de caja (propuesta ${s.origen})`,['Persona','Rol',...DIAS],grillaPlan(s.propuesta))
 tabla('Horas por persona',['Persona','Rol','Contrato/presencia','Contrato origen','Tope caja','Caja','Presencia fuera de caja','Disponible caja'],
  s.horasPorEmpleado.map(x=>{const r=x as Record<string,unknown>;return [String(r.id),String(r.rol),String(r.horasContractuales??r.horasPresencia??'—'),String(r.contratoOrigen??'—'),
   r.rol==='EVENTUAL'?(r.topeCajaHoras==null?'sin tope':`${r.topeCajaHoras} (${(r.origenTope as string[]|undefined)?.join('; ')??''})`):'—',String(r.horasCaja),String(r.horasFuncionHabitualRealizadas??r.horasSupervisionOFueraDeCaja??'—'),String(r.disponibilidadCajaEfectivaHoras??'—')]}))
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
