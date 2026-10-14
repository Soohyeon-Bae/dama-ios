// Local, conservative date detection. Always reviewed by the user before saving.
export function cleanText(text=''){
 return String(text).normalize('NFKC').replace(/\r/g,'').replace(/[ \t]+/g,' ').split('\n').map(s=>s.trim()).filter(s=>s&&!/^(?:\d{1,2}:\d{2}\s*[^가-힣]*|댓글 추가.*|관심 없.*|관심 있.*|좋아요 보기|팔로우|더 보기|보기 [·.] .*|\d{1,4})$/.test(s)).join('\n');
}
function date(y,m,d){y=+y;m=+m;d=+d;const q=new Date(Date.UTC(y,m-1,d));if(q.getUTCFullYear()!==y||q.getUTCMonth()+1!==m||q.getUTCDate()!==d)return '';return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
function times(s){const out=[];for(const m of s.matchAll(/(?:([01]?\d|2[0-3]):([0-5]\d)|([01]?\d|2[0-3])\s*시(?:\s*([0-5]?\d)\s*분)?)/g)){out.push(`${String(m[1]??m[3]).padStart(2,'0')}:${String(m[2]??m[4]??0).padStart(2,'0')}`);}return out;}
function leadingTime(s){const m=s.match(/^\s*[,，·]?\s*((?:[01]?\d|2[0-3]):[0-5]\d|(?:[01]?\d|2[0-3])\s*시(?:\s*[0-5]?\d\s*분)?)/);return m?times(m[1])[0]:'';}
const EVENT=/일정|접수|면접|공연|전시|체크인|체크아웃|예약|결제|마감|참가|행사|호텔|Hotel|Race|모집|합격|상영|강연|입장|여행|체험|신청|등록/i;
export function findDates(text,now=new Date()){
 const cleaned=cleanText(text);const allYear=cleaned.match(/(?:20\d{2}|\b\d{2})\s*년/)||cleaned.match(/\b20\d{2}\b/);let y=allYear?parseInt(allYear[0]):now.getFullYear();if(y<100)y+=2000;
 const yearInferred=!allYear;
 const rx=/(?:(20\d{2}|\b\d{2})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일|\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/g;
 const found=[];
 for(const m of cleaned.matchAll(rx)){
  let yr=m[1]?+m[1]:m[4]?+m[4]:y;if(yr<100)yr+=2000;
  const month=+(m[2]||m[5]),day=+(m[3]||m[6]),start=date(yr,month,day);if(!start)continue;
  const before=cleaned.slice(Math.max(0,m.index-85),m.index);const after=cleaned.slice(m.index+m[0].length,m.index+m[0].length+150);
  const context=(before+ m[0]+after).replace(/\n/g,' ');
  // Historical years in prose do not become schedules; a complete date needs schedule context.
  if(!EVENT.test(context))continue;
  const nextFull=after.search(rx);const dateTail=nextFull>=0?after.slice(0,nextFull):after;
  const parts=dateTail.split('\n');
  // A date heading must not borrow an unrelated time from later sections.
  const tail=parts[0]+(parts[1]&&/^\s*(?:\([가-힣]\))?\s*\d{1,2}\s*(?:시|:)/.test(parts[1])?' '+parts[1]:'');
  const short=tail.match(/^\s*(?:\([가-힣]\)|[가-힣]?\s*요일)?\s*((?:[01]?\d|2[0-3]):[0-5]\d|(?:[01]?\d|2[0-3])\s*시(?:\s*[0-5]?\d\s*분)?)?\s*(?:~|～|–|—|-)\s*(\d{1,2})\s*일/);
  let end=short?date(yr,month,short[2]):start;
  if(short&&end&&end<start){const next=new Date(Date.UTC(yr,month,1));end=date(next.getUTCFullYear(),next.getUTCMonth()+1,short[2]);}
  const rangeFull=after.match(/^\s*(?:\([가-힣]\))?\s*(?:[0-2]?\d:[0-5]\d|\d{1,2}시(?:\s*\d{1,2}분)?)?\s*(?:~|～|–|—|-|부터)\s*(?:(20\d{2})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if(rangeFull){const endYear=rangeFull[1]?+rangeFull[1]:yr;end=date(endYear,rangeFull[2],rangeFull[3]);if(!rangeFull[1]&&end&&end<start)end=date(endYear+1,rangeFull[2],rangeFull[3]);}
  const time=short?times(short[1]||'')[0]||'':times(tail)[0]||'';
  const endTime=short?leadingTime(tail.slice(short[0].length)):rangeFull?leadingTime(after.slice(rangeFull[0].length).split('\n')[0]):'';
  let label='일정';
  const closeBefore=before.slice(-45);
  if(/마감|까지|결제/.test(tail.slice(0,80)+closeBefore))label=/결제/.test(context)?'결제 마감':'접수 마감';
  else if(/2\s*차|최종/.test(closeBefore)||/합격자에 한해 안내/.test(after.slice(0,70)))label='최종 면접';
  else if(/1\s*차|서울|부산/.test(closeBefore)&&/면접/.test(context))label='1차 면접';
  else if(/발표|합격/.test(closeBefore))label='결과 발표';
  else if(/hotel|호텔|예약|여행/i.test(context))label='예약 · 여행';
  else if(/공연|음악회/.test(context))label='공연';
  else if(/전시/.test(context))label='전시';
  const condition=/합격자|변경|예정|안내 예정/.test(context)?'참가 조건과 변경 가능 여부를 원문에서 확인해 주세요.':'';
  found.push({start,end:end||start,time,endTime,label,context:context.slice(0,200),yearInferred,condition,index:m.index,rangeEndIndex:rangeFull&&nextFull>=0?m.index+m[0].length+nextFull:null});
 }
 // Consecutive dates with an explicit connector form one range.
 for(let i=0;i<found.length-1;i++){
  const a=found[i],b=found[i+1];const between=cleaned.slice(a.index,b.index);
  if((a.rangeEndIndex===b.index||a.end===b.start||/부터/.test(between))&&a.end!==a.start){a.endTime=a.endTime||b.time;b.skip=true;}
 }
 const candidates=found.filter(a=>!a.skip);
 for(const a of [...candidates]){if(a.end!==a.start&&/까지/.test(a.context)&&/결제|접수|마감/.test(a.context)){candidates.push({...a,start:a.end,end:a.end,time:a.endTime,label:/결제/.test(a.context)?'결제 마감':'접수 마감'});a.label=/결제/.test(a.context)?'결제 기간':'접수 기간';}}
 const unique=[];for(const a of candidates){if(!unique.some(b=>b.start===a.start&&b.end===a.end&&b.time===a.time))unique.push(a);}
 const today=date(now.getFullYear(),now.getMonth()+1,now.getDate());
 return unique.sort((a,b)=>{
  const score=q=>(q.start>=today?100:0)+(/마감/.test(q.label)?20:0)+(q.time?4:0)+(q.end!==q.start?1:0);
  return score(b)-score(a)||a.start.localeCompare(b.start);
 });
}
export function suggest(text,now=new Date()){
 const body=cleanText(text),flat=body.replace(/\s/g,'');let category='정보',emoji='📎';
 if(/책|작가|문학|출판|소설/.test(flat)){category='책';emoji='📖';}
 else if(/운동|쓰러스트|스러스트|디딤발|벤치|무릎|엉덩이/.test(flat)){category='운동';emoji='🧘';}
 else if(/할인|혜택|멤버십/.test(flat)){category='혜택';emoji='🎟️';}
 else if(/Hotel|호텔|여행|숙박/i.test(body)){category='여행';emoji='🧳';}
 else if(/면접|전형|채용/.test(flat)){category='채용';emoji='🌷';}
 else if(/결제|마감/.test(flat)){category='할 일';emoji='✅';}
 else if(/전시/.test(flat)){category='전시';emoji='🖼️';}
 else if(/공연|음악회/.test(flat)){category='공연';emoji='🎵';}
 const lines=body.split('\n').filter(s=>s.length>3&&/[가-힣A-Za-z]{2}/.test(s)&&!/팔로우|님 외|좋아합니다|Web발신|안녕하세요|회원님을 위한|광고가 너무|너무 자주|별로 자주/.test(s));
 const chosen=lines.find(s=>/제목|음악회|전시|Save Race|Hotel|자서전|쓰러스트|면접 절차|이월드/i.test(s))||lines[0]||'새로운 기억';
 const book=chosen.match(/[<〈《]([^>〉》]+)[>〉》]/);
 const title=(category==='책'&&book?book[1]+' · 읽고 싶은 책':category==='혜택'&&/이월드/.test(body)?'이월드 · 혜택 정보':category==='운동'&&/쓰러스트/.test(flat)?'힙 쓰러스트 · 운동 팁':category==='채용'?'채용 · 전형 일정':chosen.replace(/^[•#>\s|ᅵ]+/,'')).slice(0,65);
 const dates=findDates(body,now);
 let paragraphs=body.split('\n').filter(s=>s.length>=5&&!/팔로우|님 외|좋아합니다|관심없음|관심있음|댓글추가|보기 [·.-]|너무 자주|별로 자주/.test(s));
 if(category==='운동'){
  const focused=paragraphs.filter(s=>/팔|벤[치지]|무릎|엉덩이|절반|버티기|디딤|디딩|내려|내러|셋팅|세팅|압력/.test(s)&&(s.match(/[가-힣]/g)||[]).length/Math.max(1,(s.match(/[가-힣A-Za-z0-9]/g)||[]).length)>.68);
  if(focused.length)paragraphs=[...new Set(focused)];
 }
 const blocks=paragraphs.slice(0,100).map(s=>({type:s.length<34&&/TIP|CHECK|안내|절차|혜택|주의|소개/.test(s)?'heading':'text',text:s,checked:false}));
 return {title,category,emoji,dates,blocks:blocks.length?blocks:[{type:'text',text:'기억하고 싶은 내용을 적어주세요.',checked:false}],text:body};
}
