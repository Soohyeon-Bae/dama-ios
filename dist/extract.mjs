// Local, conservative date detection. Always reviewed by the user before saving.
export function cleanText(text=''){
 return String(text).normalize('NFKC').replace(/\r/g,'').replace(/[ \t]+/g,' ').split('\n').map(s=>s.trim()).filter((s,i)=>s&&!(i<3&&/^\d{1,2}:\d{2}\s*[^가-힣]*$/.test(s)&&/[A-Za-z@©]/.test(s))&&!/^(?:댓글 추가.*|관심 없.*|관심 있.*|좋아요 보기|팔로우|더 보기|보기 [·.] .*|\d{1,3})$/.test(s)).join('\n');
}
function date(y,m,d){y=+y;m=+m;d=+d;const q=new Date(Date.UTC(y,m-1,d));if(q.getUTCFullYear()!==y||q.getUTCMonth()+1!==m||q.getUTCDate()!==d)return '';return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
const CLOCK='(?:(?:오전|오후|AM|PM)\\s*)?(?:[01]?\\d|2[0-3])\\s*(?::[0-5]\\d|시(?:\\s*[0-5]?\\d\\s*분)?)';
const CLOCK_RX=new RegExp(CLOCK,'gi');
function times(s){const out=[];for(const m of String(s).matchAll(CLOCK_RX)){const p=m[0].match(/^\s*(오전|오후|AM|PM)?\s*(\d{1,2})\s*(?::(\d{2})|시(?:\s*(\d{1,2})\s*분)?)/i);if(!p)continue;let h=+p[2];const meridian=(p[1]||'').toLowerCase();if(meridian==='오후'||meridian==='pm'){if(h<12)h+=12;}else if((meridian==='오전'||meridian==='am')&&h===12)h=0;out.push(`${String(h).padStart(2,'0')}:${String(+(p[3]??p[4]??0)).padStart(2,'0')}`);}return out;}
function leadingTime(s){const m=String(s).match(new RegExp(`^\\s*[,，·]?\\s*(?:\\([월화수목금토일]\\)\\s*)?(${CLOCK})`,'i'));return m?times(m[1])[0]:'';}
const EVENT=/일정|접수|면접|공연|전시|체크인|체크아웃|예약|결제|마감|참가|행사|호텔|Hotel|Race|모집|합격|상영|극장|영화|강연|입장|여행|체험|신청|등록|채용|시험|축제|박람회|콘서트|세미나|수업|출발|도착/i;
const DATE_BODY='(?:(20\\d{2}|[2-3]\\d)\\s*(?:년|[./-])\\s*)?(\\d{1,2})\\s*(?:월|[./-])\\s*(\\d{1,2})\\s*일?';
const DATE_RX=new RegExp(`(?<![\\dA-Za-z])${DATE_BODY}`,'g');
const END_DATE_RX=new RegExp(`^${DATE_BODY}`);
const RANGE_PREFIX=new RegExp(`^\\s*(?:\\([월화수목금토일]\\)\\s*)?(?:(${CLOCK})\\s*)?(?:~|～|–|—|-|부터)\\s*`,'i');
function fullYear(raw){const y=+raw;return y<100?2000+y:y;}
function lineAt(s,index){const start=s.lastIndexOf('\n',index-1)+1;const end=s.indexOf('\n',index);return {start,end:end<0?s.length:end};}
function addWarning(warnings,message){if(!warnings.includes(message))warnings.push(message);}
function sameProgram(a,b){
 const x=a.replace(/[^가-힣A-Za-z0-9]/g,'').toLowerCase(),y=b.replace(/[^가-힣A-Za-z0-9]/g,'').toLowerCase();
 const limit=Math.max(2,Math.floor(Math.min(x.length,y.length)*.18));
 if(Math.abs(x.length-y.length)>limit)return false;
 let previous=Array.from({length:y.length+1},(_,i)=>i);
 for(let i=1;i<=x.length;i++){
  const current=[i];for(let j=1;j<=y.length;j++)current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(x[i-1]===y[j-1]?0:1));
  previous=current;
 }
 return previous[y.length]<=limit;
}
function subtitleLine(s){
 const v=String(s||'').trim();
 return v.length>=3&&v.length<=28&&!/^\[|^(?:행사|상영|공연|신청|이름|장소|시간|날짜|광화문|서울|전체|동반|인원|취소)/.test(v)&&!/책마당|도서관|\d{4}[.\/-]|\d{1,2}\s*월\s*\d{1,2}\s*일/.test(v)?v:'';
}
export function findDates(text,now=new Date()){
 const cleaned=cleanText(text);
 const matches=[...cleaned.matchAll(DATE_RX)];
 // A copyright year or an article's historical year is not evidence for an undated event.
 const yearEvidence=[...cleaned.matchAll(/(?<!\d)(20\d{2})(?!\d)/g)].filter(m=>{
  const row=lineAt(cleaned,m.index),line=cleaned.slice(row.start,row.end);
  return EVENT.test(line)||matches.some(d=>d[1]&&d.index===m.index&&EVENT.test(cleaned.slice(Math.max(0,d.index-80),d.index+d[0].length+80)));
 }).map(m=>+m[1]).concat(matches.filter(m=>m[1]&&EVENT.test(cleaned.slice(Math.max(0,m.index-80),m.index+m[0].length+80))).map(m=>fullYear(m[1]))).filter(y=>y>=2000&&y<=now.getFullYear()+10);
 const years=[...new Set(yearEvidence)],documentYear=years.length===1?years[0]:null;
 const found=[];
 for(let i=0;i<matches.length;i++){
  const m=matches[i],previous=matches[i-1],next=matches[i+1],where=lineAt(cleaned,m.index);
  const explicitYear=!!m[1],yr=explicitYear?fullYear(m[1]):documentYear||now.getFullYear();
  const month=+m[2],day=+m[3],start=date(yr,month,day);if(!start)continue;
  // A bare "2/4" on its own line is usually a carousel counter, not February 4.
  if(!explicitYear&&!/[년월일]/.test(m[0])&&month<10&&day<10&&!EVENT.test(cleaned.slice(where.start,where.end)))continue;
  const before=cleaned.slice(Math.max(0,m.index-95),m.index),after=cleaned.slice(m.index+m[0].length,m.index+m[0].length+180);
  const context=(before+m[0]+after).replace(/\n/g,' ').slice(0,260);
  // An OCR date in an article is not an event unless schedule words are nearby.
  if(!EVENT.test(context))continue;
  const localBefore=cleaned.slice(Math.max(where.start,previous&&previous.index+previous[0].length<m.index?previous.index+previous[0].length:where.start,m.index-65),m.index);
  const localAfter=cleaned.slice(m.index+m[0].length,Math.min(where.end,next?next.index:cleaned.length,m.index+m[0].length+65));
  const local=(localBefore+' '+localAfter).replace(/\s+/g,' ').trim();
  const nextLine=cleaned.slice(where.end+1,cleaned.indexOf('\n',where.end+1)<0?cleaned.length:cleaned.indexOf('\n',where.end+1));
  const clue=EVENT.test(local)?local:(local+' '+nextLine.slice(0,65)+' '+before.slice(-45)).trim();
  const dateTail=next?cleaned.slice(m.index+m[0].length,next.index):after;
  const firstLine=dateTail.split('\n')[0];
  const secondLine=dateTail.split('\n')[1]||'';
  const tail=firstLine+(leadingTime(secondLine)?' '+secondLine:'');
  const rangePrefix=after.match(RANGE_PREFIX);
  let end=start,endTime='',endMatchIndex=null,time=leadingTime(tail);
  if(rangePrefix){
   const remaining=after.slice(rangePrefix[0].length),full=remaining.match(END_DATE_RX),short=full?null:remaining.match(/^(\d{1,2})\s*일/);
   if(full||short){
    const endYear=full&&full[1]?fullYear(full[1]):yr,endMonth=full?+full[2]:month,endDay=full?+full[3]:+short[1];
    let proposed=date(endYear,endMonth,endDay);
    if(proposed&&proposed<start&&!(full&&full[1]))proposed=date(endYear+1,endMonth,endDay);
    if(proposed&&proposed>=start){
     end=proposed;time=times(rangePrefix[1]||'')[0]||'';
     const rest=remaining.slice((full||short)[0].length);
     endTime=leadingTime(rest.split('\n')[0])||leadingTime(rest.split('\n')[1]||'');
     if(full)endMatchIndex=m.index+m[0].length+rangePrefix[0].length;
    }
   }
  }
  let label='일정',kind='generic';
  // "행사일시" describes the booked event even on an application-status page.
  if(/행사\s*일시|상영\s*일시|공연\s*일시|방문\s*일시/.test(local)){label='행사';kind='event';}
  else if(/(?:최종|2\s*차).*면접|면접.*(?:최종|2\s*차)/.test(clue)){label='최종 면접';kind='event';}
  else if(/(?:1\s*차).*면접|면접.*1\s*차/.test(clue)){label='1차 면접';kind='event';}
  else if(/면접/.test(clue)){label='면접';kind='event';}
  else if(/(?:결제|납부)/.test(clue)&&/(?:마감|까지|종료)/.test(clue+tail)){label='결제 마감';kind='deadline';}
  else if(/(?:접수|신청|등록|모집)/.test(clue)&&/(?:마감|까지|종료)/.test(clue+tail)){label='접수 마감';kind='deadline';}
  else if(/(?:환불|취소)/.test(clue)&&/(?:마감|까지|종료)/.test(clue+tail)){label='환불 마감';kind='deadline';}
  else if(/발표|합격/.test(clue)){label='결과 발표';kind='announcement';}
  else if(/(?:결제|납부)/.test(clue)){label='결제 일정';kind='period';}
  else if(/(?:접수|신청|등록|모집)/.test(clue)){label='접수 일정';kind='period';}
  else if(/hotel|호텔|예약|여행|숙박|체크인|체크아웃/i.test(clue)){label='예약 · 여행';kind='event';}
  else if(/공연|음악회|콘서트/.test(clue)){label='공연';kind='event';}
  else if(/상영|극장|영화/.test(clue)){label='영화';kind='event';}
  else if(/전시|박람회/.test(clue)){label='전시';kind='event';}
  else if(/행사|축제|체험|강연|수업|시험|상영|Race/i.test(clue)){label='행사';kind='event';}
  const warnings=[];
  if(!explicitYear)addWarning(warnings,'날짜에 연도가 없어 확인이 필요해요.');
  if(explicitYear&&m[1].length===2)addWarning(warnings,`두 자리 연도를 ${yr}년으로 읽었어요.`);
  if(!explicitYear&&/[./-]/.test(m[0])&&!/년|월|일/.test(m[0]))addWarning(warnings,'숫자 날짜를 월/일 순서로 읽었어요.');
  if(/합격자|변경|예정|안내 예정/.test(context))addWarning(warnings,'참가 조건과 변경 가능 여부를 원문에서 확인해 주세요.');
  // Parsing evidence only; this is not an OCR accuracy percentage.
  const confidence=Math.max(30,Math.min(95,(explicitYear?83:documentYear?68:56)+(EVENT.test(local)?8:0)+(time?3:0)-(warnings.length>1?8:0)));
  const status=[...cleaned.slice(0,m.index).matchAll(/신청\s*완료|신청\s*취소|취소\s*완료|미참석/g)].at(-1)?.[0]||'';
  const canceled=/취소|미참석/.test(status);
  if(canceled)addWarning(warnings,'취소되거나 미참석한 항목일 수 있어요. 원문을 확인해 주세요.');
  found.push({start,end,time,endTime,label,context:context.slice(0,200),yearInferred:!explicitYear,condition:warnings.join(' '),warnings,confidence,kind,canceled,index:m.index,endMatchIndex});
 }
 // An end date in a printed range belongs to its start, not another event.
 for(const a of found){if(a.endMatchIndex!==null){const b=found.find(q=>q.index===a.endMatchIndex);if(b){a.endTime=a.endTime||b.time;b.skip=true;}}}
 const candidates=found.filter(a=>!a.skip);
 for(const a of [...candidates]){
  if(a.end!==a.start&&/(?:까지|마감|종료)/.test(a.context)&&/(?:결제|접수|신청|등록|모집)/.test(a.context)){
   const payment=/결제|납부/.test(a.context),deadline=payment?'결제 마감':'접수 마감';
   candidates.push({...a,start:a.end,end:a.end,time:a.endTime,endTime:'',label:deadline,kind:'deadline'});
   a.label=payment?'결제 기간':'접수 기간';a.kind='period';
  }
 }
 const unique=[];for(const a of candidates){if(!unique.some(b=>b.start===a.start&&b.end===a.end&&b.time===a.time&&b.label===a.label))unique.push(a);}
 const today=date(now.getFullYear(),now.getMonth()+1,now.getDate());
 const rank=q=>(q.start>=today?50:0)+({event:38,deadline:30,announcement:23,period:14,generic:0}[q.kind]||0)+(q.time?4:0)+(q.yearInferred?0:4)-(q.canceled?30:0);
 return unique.sort((a,b)=>rank(b)-rank(a)||(a.start>=today?a.start.localeCompare(b.start):b.start.localeCompare(a.start))).map(({kind,index,endMatchIndex,skip,canceled,...a})=>a);
}
export function suggest(text,now=new Date()){
 const body=cleanText(text),flat=body.replace(/\s/g,''),dates=findDates(body,now);let category='정보',emoji='📎';
 if(dates.length&&/(?:극장|상영|영화)/.test(flat)&&/(?:행사일시|상영일시|공연일시|영화제|극장)/.test(flat)){category='영화';emoji='🎬';}
 else if(/책|작가|문학|출판|소설/.test(flat)){category='책';emoji='📖';}
 else if(/운동|쓰러스트|스러스트|디딤발|벤치|무릎|엉덩이/.test(flat)){category='운동';emoji='🧘';}
 else if(/할인|혜택|멤버십/.test(flat)){category='혜택';emoji='🎟️';}
 else if(/Hotel|호텔|여행|숙박/i.test(body)){category='여행';emoji='🧳';}
 else if(/면접|전형|채용/.test(flat)){category='채용';emoji='🌷';}
 else if(/결제|마감/.test(flat)){category='할 일';emoji='✅';}
 else if(/전시/.test(flat)){category='전시';emoji='🖼️';}
 else if(/공연|음악회/.test(flat)){category='공연';emoji='🎵';}
 const lines=body.split('\n').filter(s=>s.length>3&&/[가-힣A-Za-z]{2}/.test(s)&&!/팔로우|님 외|좋아합니다|Web발신|안녕하세요|회원님을 위한|광고가 너무|너무 자주|별로 자주/.test(s));
 const programs=lines.map((s,index)=>({line:s,index,bracket:s.match(/\[[^\]]{4,}\]/)?.[0]||''})).filter(p=>p.bracket&&/극장|영화|상영|공연|전시|행사|축제|연극|뮤지컬/.test(p.bracket));
 const program=programs[0];
 const chosen=program?.line||lines.find(s=>/제목|음악회|전시|Save Race|Hotel|자서전|쓰러스트|면접 절차|이월드/i.test(s))||lines[0]||'새로운 기억';
 const book=chosen.match(/[<〈《]([^>〉》]+)[>〉》]/);
 const bracket=program?.bracket;
 const subtitle=programs.filter(p=>sameProgram(p.bracket,bracket)).map(p=>subtitleLine(p.line.slice(p.line.indexOf(p.bracket)+p.bracket.length))||subtitleLine(lines[p.index+1])).find(Boolean)||'';
 const title=(bracket?bracket+(subtitle?' · '+subtitle:''):category==='책'&&book?book[1]+' · 읽고 싶은 책':category==='혜택'&&/이월드/.test(body)?'이월드 · 혜택 정보':category==='운동'&&/쓰러스트/.test(flat)?'힙 쓰러스트 · 운동 팁':category==='채용'?'채용 · 전형 일정':chosen.replace(/^[•#>\s|ᅵ]+/,'')).slice(0,65);
 const location=body.match(/(?:^|\n)\s*장소\s*[:：]?\s*([^\n]{3,50})/)?.[1]?.trim()||body.match(/광화문\s*책마당/)?.[0]||'';
 let paragraphs=body.split('\n').filter(s=>s.length>=5&&!/팔로우|님 외|좋아합니다|관심없음|관심있음|댓글추가|보기 [·.-]|너무 자주|별로 자주/.test(s));
 if(category==='운동'){
  const focused=paragraphs.filter(s=>/팔|벤[치지]|무릎|엉덩이|절반|버티기|디딤|디딩|내려|내러|셋팅|세팅|압력/.test(s)&&(s.match(/[가-힣]/g)||[]).length/Math.max(1,(s.match(/[가-힣A-Za-z0-9]/g)||[]).length)>.68);
  if(focused.length)paragraphs=[...new Set(focused)];
 }
 const blocks=paragraphs.slice(0,100).map(s=>({type:s.length<34&&/TIP|CHECK|안내|절차|혜택|주의|소개/.test(s)?'heading':'text',text:s,checked:false}));
 return {title,category,emoji,location,dates,blocks:blocks.length?blocks:[{type:'text',text:'기억하고 싶은 내용을 적어주세요.',checked:false}],text:body};
}
