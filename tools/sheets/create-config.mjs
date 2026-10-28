import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const root=new URL('../../',import.meta.url);const schema=JSON.parse(await fs.readFile(new URL('config/schema.json',root),'utf8'));
await fs.mkdir(new URL('artifacts/config-previews/',root),{recursive:true});
for(const group of [...new Set(schema.rows.map(r=>r.group))]){
 const wb=Workbook.create(),s=wb.worksheets.add('参数');s.showGridLines=false;
 const rows=schema.rows.filter(r=>r.group===group);
 const matrix=[['所属对象','字段','配置值（修改此列）','类型','填写说明','唯一ID（勿改）'],...rows.map(r=>[r.entity,r.label,r.value,{number:'数值',string:'文本',boolean:'开关'}[r.type],r.note,r.key])];
 s.getRange(`A1:F${matrix.length}`).values=matrix;
 s.getRange(`A1:F${matrix.length}`).format.font={name:'Arial',size:10};
 s.getRange('A1:F1').format={fill:'#263747',font:{bold:true,color:'#FFFFFF'},rowHeight:28};
 s.getRange(`C2:C${matrix.length}`).format.fill='#FFF2CC';
 for(const [col,width]of [['A',36],['B',29],['C',72],['D',10],['E',68],['F',70]])s.getRange(`${col}1:${col}${matrix.length}`).format.columnWidth=width;
 s.getRange(`C2:C${matrix.length}`).format.wrapText=true;
 for(let i=0;i<rows.length;i++){
  const row=rows[i],cell=s.getCell(i+1,2);
  if(row.type==='number')cell.setNumberFormat('0.########');
  if(row.type==='string')cell.format.rowHeight=Math.max(24,Math.ceil(String(row.value).length/38)*18);
 }
 s.freezePanes.freezeRows(1);s.tables.add(`A1:F${matrix.length}`,true,'Parameters');
 wb.recalculate();console.log((await wb.inspect({kind:'table',range:'参数!A1:D4',include:'values',tableMaxRows:4,tableMaxCols:4,maxChars:600})).ndjson);
 const errors=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!',options:{useRegex:true,maxResults:5},summary:'formula error scan'});console.log(errors.ndjson);
 const png=await wb.render({sheetName:'参数',range:'A1:D8',scale:1,format:'png'});await fs.writeFile(new URL(`artifacts/config-previews/${group}.png`,root),new Uint8Array(await png.arrayBuffer()));
 await (await SpreadsheetFile.exportXlsx(wb)).save(fileURLToPath(new URL(`config/${group}.xlsx`,root)));
 console.log(group,rows.length);
}
