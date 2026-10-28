import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const root=new URL('../../',import.meta.url);const schema=JSON.parse(await fs.readFile(new URL('config/schema.json',root),'utf8'));
await fs.mkdir(new URL('artifacts/config-previews/',root),{recursive:true});
for(const group of [...new Set(schema.rows.map(r=>r.group))]){
 const wb=Workbook.create(),s=wb.worksheets.add('参数');s.showGridLines=false;
 const rows=schema.rows.filter(r=>r.group===group);
 const matrix=[['参数ID（勿改）','对象 / 参数','配置值（修改此列）','初始参考值','来源'],...rows.map(r=>[r.key,r.label,r.value,r.value,r.source])];
 s.getRange(`A1:E${matrix.length}`).values=matrix;
 s.getRange(`A1:E${matrix.length}`).format.font={name:'Arial',size:10};
 s.getRange('A1:E1').format={fill:'#263747',font:{bold:true,color:'#FFFFFF'},rowHeight:28};
 s.getRange(`C2:C${matrix.length}`).format.fill='#FFF2CC';s.getRange(`C2:D${matrix.length}`).setNumberFormat('0.########');
 for(const [col,width]of [['A',43],['B',70],['C',24],['D',20],['E',45]])s.getRange(`${col}1:${col}${matrix.length}`).format.columnWidth=width;
 s.freezePanes.freezeRows(1);s.tables.add(`A1:E${matrix.length}`,true,'Parameters');
 wb.recalculate();console.log((await wb.inspect({kind:'table',range:'参数!A1:D4',include:'values',tableMaxRows:4,tableMaxCols:4,maxChars:600})).ndjson);
 const png=await wb.render({sheetName:'参数',range:'B1:D8',scale:1,format:'png'});await fs.writeFile(new URL(`artifacts/config-previews/${group}.png`,root),new Uint8Array(await png.arrayBuffer()));
 await (await SpreadsheetFile.exportXlsx(wb)).save(fileURLToPath(new URL(`config/${group}.xlsx`,root)));
 console.log(group,rows.length);
}
