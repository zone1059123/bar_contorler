import * as XLSX from '@e965/xlsx'
import {mkdirSync,writeFileSync} from 'node:fs'
const inventory=[
  ['分類','品項','容量','瓶價','昨-1F','昨-3F','1F','3F','進','到貨庫位'],
  ['基酒','London Dry 範例琴酒','0.7L',720,3.8,2,0.5,1,0,'1F'],
  ['基酒','範例波本威士忌','750ml',980,3,4,0.3,2,0,'3F'],
  ['利口酒','Campari 範例苦酒','750ml',690,1.9,1,0.8,0,0,'1F'],
  ['基酒','Blanco 範例龍舌蘭',700,840,5,2,4.2,2,2,'1F'],
  ['軟飲','範例通寧水','200ml',38,12,20,8,14,0,'1F']
]
const long=[
  ['品項','庫位','未開瓶數','開瓶比例','容量','瓶價','分類'],
  ['London Dry 範例琴酒','1F',0,'50%','0.7L',720,'基酒'],
  ['London Dry 範例琴酒','3F',1,0,'700ml',720,'基酒'],
  ['範例通寧水','三樓',14,0,'200ml',38,'軟飲']
]
const revenue=[
  ['日期','酒水銷售額','總銷售額','其他成本'],
  [null,12500,17500,380]
]
const book=XLSX.utils.book_new()
for (const [name,rows] of [['雙樓層盤點',inventory],['逐列庫位盤點',long],['每日營收',revenue]]) {
  const sheet=XLSX.utils.aoa_to_sheet(rows)
  sheet['!cols']=rows[0].map(()=>({wch:20}))
  XLSX.utils.book_append_sheet(book,sheet,name)
}
mkdirSync('public',{recursive:true})
writeFileSync('public/sample-inventory.xlsx',XLSX.write(book,{type:'buffer',bookType:'xlsx'}))
writeFileSync('public/sample-inventory.xls',XLSX.write(book,{type:'buffer',bookType:'biff8'}))
writeFileSync('public/sample-inventory.csv','\uFEFF'+XLSX.utils.sheet_to_csv(book.Sheets['雙樓層盤點']))
