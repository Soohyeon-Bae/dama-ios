import {allItems,putItem,removeItem,getMeta,setMeta,putMany} from './db.js';
import {suggest} from './extract.mjs';
import {readImage} from './ocr.js';
import {isNativeApp,choosePhotos,scheduleReminder,cancelReminder,pendingReminderIds,onReminderTap,shareDocument} from './native.js';
const app=document.getElementById('app'),upload=document.getElementById('upload'),restore=document.getElementById('restore');
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID();
const dayString=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today=()=>dayString(new Date());
const validDay=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;};
const dateLabel=s=>s?new Date(`${s}T12:00:00`).toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'}):'날짜 미정';
const dateFull=s=>s?new Date(`${s}T12:00:00`).toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'}):'날짜 미정';
const stamp=s=>new Date(s).toLocaleString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
let items=[],worker=null,ocrRun=0,toastTimer;const urls=new Map(),pendingSaves=new Map(),saveFlights=new Map();
let state={mode:'calendar',view:'calendar',day:today(),month:today().slice(0,7),active:null,files:[],selected:new Set(),busy:false,progress:0,progressText:'',draft:null,query:'',filter:'전체',deleteConfirm:false,attachTarget:null};
function url(a){if(!urls.has(a.id))urls.set(a.id,URL.createObjectURL(a.blob));return urls.get(a.id);}
function toast(s){const el=document.getElementById('toast');el.textContent=s;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3500);}
function entry(i){return `<button class="entry" data-act="open" data-id="${E(i.id)}"><span class="entry-emoji ${['공연','혜택','책'].includes(i.category)?'peach':i.category==='채용'?'lavender':''}">${E(i.emoji)}</span><span class="entry-copy"><strong>${E(i.title)}</strong><small>${i.type==='event'?`${dateLabel(i.start)}${i.end!==i.start?' ~ '+dateLabel(i.end):''} · ${E(i.time||'시간 미정')}`:`${E(i.category)} · 스크린샷 ${i.attachments.length}장`}${i.sample?' · 예시':''}</small></span><span class="chevron" aria-hidden="true">›</span></button>`;}
function empty(s='아직 담긴 기억이 없어요.'){return `<div class="empty"><span class="empty-icon">🌱</span>${s}</div>`;}
function heading(s,more=''){return `<div class="section-heading"><h3>${s}</h3><span>${more}</span></div>`;}
function intro(title,sub,emoji=''){return `<div class="intro intro-row"><div><div class="eyebrow">LITTLE THINGS, WELL KEPT</div><h2>${title}</h2><p>${sub}</p></div>${emoji?`<span class="leaf">${emoji}</span>`:''}</div>`;}
function banner(){if(!items.length)return '<div class="sample-banner"><span>처음이라면 예시로 가볍게 둘러보세요.</span><button data-act="seed">예시 담기</button></div>';return items.some(i=>i.sample)?'<div class="sample-banner"><span>🌼 지금 보이는 예시는 가상의 내용이에요.</span><button data-act="clear-samples">예시 지우기</button></div>':'';}
function calendar(){const [y,m]=state.month.split('-').map(Number);const first=new Date(y,m-1,1),begin=new Date(y,m-1,1-first.getDay());let cells='';for(let n=0;n<42;n++){const d=new Date(begin);d.setDate(begin.getDate()+n);const ds=dayString(d);const ev=items.filter(i=>i.type==='event'&&i.start<=ds&&i.end>=ds);cells+=`<button class="day ${d.getMonth()!==m-1?'other':''} ${ds===state.day?'selected':''} ${ds===today()?'today':''}" data-act="day" data-day="${ds}" aria-label="${dateLabel(ds)}, 일정 ${ev.length}개" aria-pressed="${ds===state.day}"><span class="day-num">${d.getDate()}</span><span class="dots">${ev.slice(0,3).map(i=>`<i class="dot ${i.category==='채용'?'lavender':i.category==='공연'?'peach':''}"></i>`).join('')}</span></button>`;}
const selected=items.filter(i=>i.type==='event'&&i.start<=state.day&&i.end>=state.day).sort((a,b)=>a.time.localeCompare(b.time));return intro('기억이 일정이 되는 순간','가고 싶은 곳, 놓치고 싶지 않은 날을 담아요.','🌿')+banner()+`<div class="calendar-layout"><div class="card"><div class="calendar-head"><button data-act="month" data-delta="-1" aria-label="이전 달">‹</button><div><strong>${y}년 ${m}월</strong><button class="today" data-act="today">오늘</button></div><button data-act="month" data-delta="1" aria-label="다음 달">›</button></div><div class="weekdays">${['일','월','화','수','목','금','토'].map(s=>`<span>${s}</span>`).join('')}</div><div class="days">${cells}</div></div><div>${heading(dateLabel(state.day),'작은 약속들')}${selected.map(entry).join('')||empty('이날은 비어 있어요.<br>새로운 기억을 담아볼까요?')}<button class="secondary full" data-act="import">＋ 스크린샷으로 일정 담기</button></div></div>${heading('최근 담은 이야기','나의 페이지')}${items.filter(i=>i.type==='page').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,3).map(entry).join('')||empty('책, 운동 팁, 장소 정보를 페이지로 모아요.')}<div class="footer">작은 기억을 오래, 담아</div>`;}
function home(){const events=items.filter(i=>i.type==='event'),pages=items.filter(i=>i.type==='page');const upcoming=events.filter(i=>i.end>=today()).sort((a,b)=>a.start.localeCompare(b.start)).slice(0,4);return intro('잘 모아둔 작은 것들','언젠가의 계획과 지금의 관심사를 한곳에.','🌼')+banner()+`<div class="shelves"><button class="shelf" data-act="calendar"><span class="shelf-icon">🗓️</span><strong>캘린더</strong><small>${events.length}개의 작은 약속</small></button><button class="shelf" data-act="pages"><span class="shelf-icon">📚</span><strong>나의 페이지</strong><small>${pages.length}개의 소중한 발견</small></button></div>${heading('곧 만나러 갈 곳','UPCOMING')}${upcoming.map(entry).join('')||empty('다가오는 일정이 없어요.')}<div class="divider"></div>${heading('최근 담은 이야기','RECENT')}${pages.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,4).map(entry).join('')||empty('기억하고 싶은 정보를 담아주세요.')}<div class="footer">어떤 기억이든, 가볍게 담아요.</div>`;}
function pages(){const list=items.filter(i=>i.type==='page').filter(i=>state.filter==='전체'||i.category===state.filter).filter(i=>[i.title,i.category,...(i.blocks||[]).slice(hiddenAutoCount(i)).map(b=>b.text),i.note||''].join(' ').toLowerCase().includes(state.query.toLowerCase())).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));const cats=['전체',...new Set(items.filter(i=>i.type==='page').map(i=>i.category))];return intro('나의 작은 서랍','좋아하는 정보에 내 생각을 더해요.','📚')+banner()+`<div class="search"><input id="search" aria-label="페이지 검색" placeholder="제목이나 내용으로 찾아보세요" value="${E(state.query)}"></div><div class="filters">${cats.map(c=>`<button data-act="filter" data-filter="${E(c)}" class="${state.filter===c?'active':''}">${E(c)}</button>`).join('')}</div><div id="page-results">${list.map(entry).join('')||empty(state.query?'찾는 내용을 아직 담지 않았어요.':'아직 비어 있는 서랍이에요.')}</div>`;}
function attachments(i){return `<section class="attachments"><div class="attachments-head"><h3>함께 담은 스크린샷 <span class="results-count">${i.attachments.length}</span></h3><button data-act="attach" class="tiny-btn">＋ 추가</button></div><div class="attachments-grid">${i.attachments.map(a=>`<button class="attachment" data-act="image" data-image="${E(a.id)}"><img src="${url(a)}" alt="${E(a.filename)}"><small class="filename">${E(a.filename)}</small><small>첨부 ${stamp(a.addedAt)}</small></button>`).join('')}</div><p class="summary-note">첨부일시는 담아에 넣은 시간이에요. 사진을 촬영한 시간과는 달라요.</p></section>`;}
function hiddenAutoCount(i){
 const count=i.blocks?.length||0;
 if(Number.isInteger(i.hiddenAutoBlocks))return Math.max(0,Math.min(count,i.hiddenAutoBlocks));
 return i.type==='page'&&i.ocrText?count:0;
}
function pageBlock(b,n){return `<div class="block block-${b.type} ${b.checked?'checked':''}">${b.type==='check'?`<input type="checkbox" data-check="${n}" aria-label="${E(b.text||'체크 항목')}" ${b.checked?'checked':''}>`:''}<textarea data-block="${n}" aria-label="${b.type==='heading'?'제목 블록':'내용 블록'} ${n+1}" rows="1">${E(b.text)}</textarea><button class="remove-block" data-act="remove-block" data-index="${n}" aria-label="블록 ${n+1} 삭제">×</button></div>`;}
function detail(){
 const i=items.find(i=>i.id===state.active);if(!i)return empty();
 const blocks=i.blocks||[],hidden=hiddenAutoCount(i);
 const pageContent=`${blocks.length>hidden?`<div class="blocks">${blocks.slice(hidden).map((b,n)=>pageBlock(b,n+hidden)).join('')}</div>`:'<p class="page-empty">본문은 함께 담은 스크린샷에서 확인할 수 있어요.</p>'}${hidden?`<button class="secondary" data-act="show-old-blocks">이전에 저장한 글 보기</button>`:''}<div class="block-add">${[['heading','제목'],['text','글'],['bullet','목록'],['check','체크']].map(([t,s])=>`<button data-act="add-block" data-type="${t}">＋ ${s}</button>`).join('')}</div><p class="summary-note">직접 추가한 글·체크와 메모는 자동으로 저장돼요.</p>`;
 return `<div class="detail-head"><button class="back" data-act="back">‹ ${i.type==='event'?'캘린더':'나의 페이지'}</button><button data-act="edit">수정</button></div><div class="detail-emoji">${E(i.emoji)}</div><h2 class="detail-title">${E(i.title)}</h2><span class="chip">${E(i.category)}</span>${i.type==='event'?`<div class="meta"><div class="meta-row"><span>날짜</span><span>${dateFull(i.start)}${i.end!==i.start?'<br>~ '+dateFull(i.end):''}</span></div><div class="meta-row"><span>시간</span><span>${E(i.time||'시간 미정')}${i.endTime?' → '+E(i.endTime):''}</span></div><div class="meta-row"><span>장소</span><span>${E(i.location||'장소 미정')}</span></div></div>${i.condition?`<div class="hint warning">${E(i.condition)}</div>`:''}${reminderControl(i)}<button class="secondary" data-act="ics">↗ 캘린더 파일로 내보내기</button>`:pageContent}<div class="note"><label class="field"><span>나의 메모</span><textarea data-note placeholder="내 생각을 조용히 적어두세요.">${E(i.note||'')}</textarea></label></div>${attachments(i)}<div class="actions"><button class="secondary danger" data-act="delete">${state.deleteConfirm?'정말 삭제할까요? 한 번 더 눌러주세요.':'기억 삭제'}</button></div>`;
}
function importView(){return `<button class="back" data-act="back">‹ 돌아가기</button>${intro('스크린샷을 담아볼까요?','날짜는 일정으로, 이야기는 페이지로.','✨')}<div class="upload-zone" id="drop-zone" role="button" tabindex="0" aria-label="스크린샷 파일 선택"><span class="plus">＋</span><strong>사진을 여기에 놓아주세요</strong><p>PNG · JPG · WEBP · 한 장에 최대 15 MB</p><button class="primary" data-act="choose">${isNativeApp()?"사진 보관함에서 선택":"스크린샷 선택하기"}</button></div>${state.files.length?`<div class="import-bar"><span class="results-count">${state.selected.size}장 선택됨 / ${state.files.length}장</span><div><button data-act="select-all">모두 선택</button><button data-act="discard-import">비우기</button></div></div><div class="file-grid">${state.files.map(a=>`<label class="file-card ${state.selected.has(a.id)?'selected':''}"><input type="checkbox" data-file="${a.id}" ${state.selected.has(a.id)?'checked':''} ${state.busy?'disabled':''}><img src="${url(a)}" alt="${E(a.filename)}"><small>${E(a.filename)}</small>${a.failed?'<small class="ocr-failed">글자 인식 실패 · 직접 작성 가능</small>':''}</label>`).join('')}</div>`:''}${state.busy?`<div class="progress-track"><span style="width:${Math.max(2,state.progress)}%"></span></div><p class="progress-label" aria-live="polite">${E(state.progressText)}</p><button class="secondary full" style="margin-top:15px" data-act="cancel-ocr">읽기 취소</button>`:state.files.length?`<div class="hint">선택한 이미지는 한 페이지 또는 대표 일정 하나로 담겨요. 글자는 이 기기에서 읽습니다.</div><button class="primary full" data-act="read" ${state.selected.size?'':'disabled'}>선택한 ${state.selected.size}장 읽고 정리하기</button>`:''}<div class="hint">🔒 원본과 내용은 ${isNativeApp()?"이 앱에":"이 브라우저에"} 저장돼요.<br>글자 인식을 위해 이미지를 서버에 보내지 않습니다.</div>${!state.files.length?`<div class="divider"></div>${heading('먼저 가볍게 둘러보기')}<button class="secondary full" data-act="sample-import">가상 공연 스크린샷으로 체험하기</button>`:''}`;}
function reviewEvidence(d){
 const weak=d.attachments.some(a=>!a.ocr?.text?.trim()||Number(a.ocr?.confidence||0)<55);
 return `<section class="review-evidence"><div class="evidence-head"><strong>원본 스크린샷</strong><span>${d.attachments.length}장</span></div><p class="evidence-intro">원본을 눌러 크게 보고, 아래에서 제목과 날짜를 확인해 주세요.</p><div class="review-sources">${d.attachments.map(a=>`<button data-act="draft-image" data-image="${E(a.id)}" aria-label="${E(a.filename)} 원본 크게 보기"><img class="review-thumb" src="${url(a)}" alt="${E(a.filename)}"><small>원본 크게 보기</small></button>`).join('')}</div>${weak?'<div class="hint warning">글자를 놓쳤을 수 있어요. 원본과 제목·날짜를 비교해 주세요.</div>':''}</section>`;
}
function review(){
 const d=state.draft;if(!d)return '';
 return `<button class="back" data-act="review-back">‹ ${d.editId?'수정 취소':'이미지 선택으로'}</button>${intro(d.editId?'기억을 다듬어요':'인식 결과를 확인해주세요','제목과 날짜를 확인하고 원본과 함께 담아주세요.')}${reviewEvidence(d)}<div class="route"><button data-act="route" data-type="event" class="${d.type==='event'?'active':''}">🗓️ 대표 일정</button><button data-act="route" data-type="page" class="${d.type==='page'?'active':''}">📖 한 페이지</button></div>${d.type==='event'&&d.dates.length?`<section>${heading('원문에서 찾은 날짜','하나만 선택해요')}${d.dates.map((a,n)=>`<label class="candidate ${d.candidate===n?'selected':''}"><input type="radio" name="candidate" data-candidate="${n}" ${d.candidate===n?'checked':''}><span><strong>${E(a.label)} · ${dateFull(a.start)}${a.end!==a.start?' ~ '+dateFull(a.end):''}${a.time?' · '+E(a.time):''}</strong>${a.warnings?.length?a.warnings.map(w=>`<small class="candidate-warning">${E(w)}</small>`).join(''):(a.yearInferred?'<small>연도가 없어 확인이 필요해요.</small>':'')}</span></label>`).join('')}</section>`:''}${d.type==='event'&&!d.start?`<div class="hint warning">${d.dates.length>1?'날짜를 여러 개 찾았어요. 담을 일정 하나를 선택해주세요.':'확실한 날짜를 찾지 못했어요. 날짜를 직접 쓰거나 페이지로 담아주세요.'}</div>`:''}<label class="field"><span>제목</span><input data-draft="title" maxlength="150" value="${E(d.title)}" placeholder="기억의 제목"></label><div class="two-fields"><label class="field"><span>분류</span><input data-draft="category" maxlength="30" value="${E(d.category)}"></label><label class="field"><span>작은 아이콘</span><input data-draft="emoji" maxlength="10" value="${E(d.emoji)}"></label></div>${d.type==='event'?`<div class="two-fields"><label class="field"><span>시작 날짜</span><input type="date" data-draft="start" value="${E(d.start)}" required></label><label class="field"><span>끝 날짜</span><input type="date" data-draft="end" value="${E(d.end)}"></label></div><div class="two-fields"><label class="field"><span>시작 시간</span><input type="time" data-draft="time" value="${E(d.time)}"></label><label class="field"><span>끝 시간</span><input type="time" data-draft="endTime" value="${E(d.endTime)}"></label></div><label class="field"><span>장소</span><input data-draft="location" value="${E(d.location)}" placeholder="화면에 없으면 비워두세요"></label><div class="hint warning" data-past-warning ${d.start&&(d.end||d.start)<today()?'':'hidden'}>이미 지난 일정이에요. 기록용으로 담을 수 있어요.</div>${d.condition?`<div class="hint warning" data-condition-warning>${E(d.condition)}</div>`:''}`:`<div class="hint">본문은 원본 스크린샷에서 확인할 수 있어요. 남기고 싶은 말이 있으면 아래 메모에 적어주세요.</div>`}<label class="field"><span>나의 메모</span><textarea data-draft="note" rows="2" placeholder="꼭 기억하고 싶은 것">${E(d.note)}</textarea></label><label class="check-confirm"><input type="checkbox" data-confirm ${d.confirmed?'checked':''}><span>${d.type==='event'?'날짜·시간·참가 조건을 원문과 비교해 확인했어요.':'제목과 원본 이미지를 확인했어요.'}</span></label><button class="primary full" data-act="save" ${d.confirmed&&(d.type!=='event'||d.start)?'':'disabled'}>${d.editId?'수정 내용 저장':d.type==='event'?'대표 일정 하나 담기':'한 페이지로 담기'}</button>`;
}

function settings(){return `<button class="back" data-act="back">‹ 돌아가기</button>${intro('담아를 내 방식으로','가볍게 쓰고, 소중한 기억은 따로 보관해요.')}<section class="settings-section"><h3>시작 화면</h3><p>두 화면은 같은 일정과 페이지를 함께 사용해요.</p><div class="mode-switch"><button data-act="mode" data-mode="calendar" class="${state.mode==='calendar'?'active':''}">캘린더 중심</button><button data-act="mode" data-mode="drawer" class="${state.mode==='drawer'?'active':''}">수집함 중심</button></div></section><section class="settings-section"><h3>내 기기에만 저장</h3><p>${isNativeApp()?"로그인과 클라우드 동기화 없이 이 앱에 저장해요. 앱을 삭제하면 기억도 삭제되므로 백업을 보관해 주세요.":"로그인과 클라우드 동기화 없이 이 브라우저에 저장해요. 브라우저의 사이트 데이터를 지우면 기억도 삭제됩니다."}</p>${isNativeApp()?"":"<button class=\"secondary\" data-act=\"persist\">기기에 오래 보관 요청</button>"}<p id="storage-info" class="summary-note">${isNativeApp()?"기억은 이 iPhone의 앱 저장소에 남아요.":"저장 공간은 브라우저가 관리해요."}</p></section><section class="settings-section"><h3>기억 백업</h3><p>원본 이미지, 첨부일시, 일정과 블록을 ${isNativeApp()?"파일 앱에 저장하거나 공유해요.":"함께 담긴 파일로 내려받아요."}</p><button class="secondary" data-act="backup">백업 파일 저장</button><button class="secondary" data-act="restore">백업 불러오기</button></section><section class="settings-section"><h3>예시로 둘러보기</h3><p>가상의 전시·공연·책 정보를 넣어 화면을 확인할 수 있어요.</p><button class="secondary" data-act="seed">예시 기억 담기</button><button class="secondary" data-act="clear-samples">예시만 지우기</button></section><section class="settings-section"><h3>이 버전에서 가능한 것</h3><p>기기 내 한국어·영어 글자 인식, 대표 일정 저장, 선택한 이미지 묶기, 블록 메모, 원본 보기, 백업을 지원해요. ${isNativeApp()?"일정별 휴대폰 알림을 선택할 수 있어요. 기기 간 동기화는 아직 제공하지 않아요.":"웹을 닫은 상태의 자체 알림과 기기 간 동기화는 아직 제공하지 않아요."}</p><details><summary class="muted">오픈소스 안내</summary><p>문자인식: Tesseract.js 6.0.1, Tesseract.js-core 6.0.0, tessdata_best 한국어·tessdata_fast 영어 모델. Apache-2.0. <a href="vendor/NOTICE.txt" target="_blank" rel="noopener">라이선스 안내</a></p></details></section><div class="footer">담아 · 원본 중심 버전 2026.10.16<br>당신의 작은 기억들을 위한 공간 🌱</div>`;}
function nav(name,label,glyph){return `<button class="${state.view===name?'active':''}" data-act="${name}"><span class="nav-icon" aria-hidden="true">${glyph}</span>${label}</button>`;}
function render(){const screens={calendar,home,pages,detail,import:importView,review,settings};app.innerHTML=`<div class="shell"><aside class="sidebar"><button class="brand" data-act="home"><img src="assets/sprout.svg" alt=""><span><strong>담아</strong><small>LITTLE MEMORIES</small></span></button><nav class="side-nav" aria-label="주 메뉴">${nav('home','나의 수집함','⌂')}${nav('calendar','캘린더','▦')}${nav('pages','나의 페이지','▤')}<button class="add" data-act="import"><span class="nav-icon">＋</span>스크린샷 담기</button>${nav('settings','설정과 백업','⚙')}</nav><div class="side-note"><b>🌿 기기 안에서, 조용히</b>원본과 기억은 ${isNativeApp()?"이 앱에":"이 브라우저에"} 저장돼요.</div></aside><main class="main"><header class="topbar"><button class="topbar-title" data-act="home">🌱 담아</button><div class="mode-switch" aria-label="화면 구성"><button data-act="mode" data-mode="calendar" class="${state.mode==='calendar'?'active':''}">캘린더 중심</button><button data-act="mode" data-mode="drawer" class="${state.mode==='drawer'?'active':''}">수집함 중심</button></div><button class="tiny-btn" data-act="settings" aria-label="설정과 백업">⚙</button></header>${(screens[state.view]||calendar)()}</main></div><nav class="bottom-nav" aria-label="아래 메뉴">${state.mode==='drawer'?nav('home','수집함','⌂'):''}${nav('calendar','캘린더','▦')}<button class="add" data-act="import" aria-label="스크린샷 담기"><span class="nav-icon">＋</span><small>담기</small></button>${nav('pages','페이지','▤')}</nav>`;resizeBlocks();}
function resizeBlocks(){app.querySelectorAll('.block textarea').forEach(t=>{t.style.height='auto';t.style.height=t.scrollHeight+'px';});}
function current(){return items.find(i=>i.id===state.active);}
async function persist(i){i.updatedAt=new Date().toISOString();await putItem(i);}
function startSave(i){const prior=saveFlights.get(i.id)||Promise.resolve();const flight=prior.catch(()=>{}).then(()=>persist(i));saveFlights.set(i.id,flight);flight.catch(storageError);flight.finally(()=>{if(saveFlights.get(i.id)===flight)saveFlights.delete(i.id);}).catch(()=>{});return flight;}
function queueSave(){const i=current();if(!i)return;const pending=pendingSaves.get(i.id);if(pending)clearTimeout(pending.timer);const timer=setTimeout(()=>{pendingSaves.delete(i.id);startSave(i);},500);pendingSaves.set(i.id,{timer,item:i});}
async function settleSave(id,discard=false){const pending=pendingSaves.get(id);if(pending){clearTimeout(pending.timer);pendingSaves.delete(id);}if(pending&&!discard)await startSave(pending.item);const flight=saveFlights.get(id);if(flight)await flight.catch(()=>{});}
async function settleAllSaves(){await Promise.all([...new Set([...pendingSaves.keys(),...saveFlights.keys()])].map(id=>settleSave(id)));}
function storageError(err){console.error(err);toast('저장하지 못했어요. 저장 공간과 브라우저 설정을 확인해 주세요.');}
function go(view){state.view=view;state.deleteConfirm=false;render();window.scrollTo({top:0});}
function open(i){state.active=i.id;go('detail');}
function localDateTime(d){return `${dayString(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
function proposedReminder(i){
 const [year,month,day]=i.start.split('-').map(Number);
 const before=new Date(year,month-1,day-1,9),sameDay=new Date(year,month-1,day,9);
 const choice=before>new Date()?before:(sameDay>new Date()&&(!i.time||i.time>='09:00')?sameDay:null);
 return choice?localDateTime(choice):'';
}
function reminderControl(i){
 if(!isNativeApp())return '';
 const value=i.reminderAt||proposedReminder(i);
 return `<section class="reminder-box"><h3>휴대폰 알림</h3><p>받고 싶은 날짜와 시간을 직접 정해요. 알림을 저장할 때 iPhone 권한을 요청해요.</p><label class="field"><span>알림 시간</span><input type="datetime-local" data-reminder-at value="${E(value)}"></label><div class="reminder-actions"><button class="secondary" data-act="save-reminder">${i.reminderAt?'알림 시간 변경':'이때 알림 받기'}</button>${i.reminderAt?'<button class="secondary" data-act="remove-reminder">알림 끄기</button>':''}</div>${i.reminderAt?`<small>예약한 시간: ${stamp(new Date(i.reminderAt).toISOString())}</small>`:''}</section>`;
}
function freshNotificationId(){
 const used=new Set(items.map(item=>item.notificationId));
 let id;
 do{id=crypto.getRandomValues(new Uint32Array(1))[0]&0x7fffffff;}while(!id||used.has(id));
 return id;
}
async function saveReminderForCurrent(){
 const i=current(),value=app.querySelector('[data-reminder-at]')?.value||'';
 const at=new Date(value);
 if(!i||i.type!=='event'||!value||Number.isNaN(at.getTime())||at<=new Date()){toast('앞으로 올 알림 날짜와 시간을 선택해 주세요.');return;}
 const id=freshNotificationId();
 let committed=false;
 try{
  await settleSave(i.id);
  await scheduleReminder({id,title:i.title,at:at.toISOString(),itemId:i.id});
  const updated={...i,notificationId:id,reminderAt:value};
  await persist(updated);
  items=items.map(item=>item.id===i.id?updated:item);
  committed=true;
  let oldCancelFailed=false;
  if(i.notificationId)try{await cancelReminder(i.notificationId);}catch(e){oldCancelFailed=true;console.error(e);}
  render();toast(oldCancelFailed?'새 알림을 예약했지만 이전 알림을 끄지 못했어요. 중복 알림을 확인해 주세요.':'휴대폰 알림을 예약했어요.');
 }catch(e){if(!committed)await cancelReminder(id).catch(console.error);console.error(e);toast(e.message==='notification-permission-denied'?'iPhone 설정에서 담아 알림을 허용해 주세요.':'알림을 예약하지 못했어요. 다시 시도해 주세요.');}
}
async function removeReminderForCurrent(){
 const i=current();if(!i?.notificationId)return;
  let restoreFailed=false;
  try{
   await settleSave(i.id);
   await cancelReminder(i.notificationId);
   const updated={...i,notificationId:null,reminderAt:''};
   try{await persist(updated);}catch(e){
    if(new Date(i.reminderAt)>new Date())try{await scheduleReminder({id:i.notificationId,title:i.title,at:new Date(i.reminderAt).toISOString(),itemId:i.id,prompt:false});}catch(restoreError){restoreFailed=true;console.error(restoreError);}
    throw e;
   }
   items=items.map(item=>item.id===i.id?updated:item);
   render();toast('알림을 껐어요.');
  }catch(e){console.error(e);toast(restoreFailed?'저장 오류로 알림을 복원하지 못했어요. 알림을 다시 설정해 주세요.':'알림을 끄지 못했어요. 다시 시도해 주세요.');}
}
async function syncSavedReminder(i,old){
 if(!isNativeApp()||!old?.notificationId)return;
 try{
   if(i.type==='event'&&i.reminderAt&&new Date(i.reminderAt)>new Date())await scheduleReminder({id:i.notificationId,title:i.title,at:new Date(i.reminderAt).toISOString(),itemId:i.id,prompt:false});
   else await cancelReminder(old.notificationId);
  }catch(e){
   console.error(e);
   if(i.type==='event'&&i.reminderAt&&new Date(i.reminderAt)>new Date()){
    try{if(!(await pendingReminderIds()).has(i.notificationId)){i.notificationId=null;i.reminderAt='';await putItem(i);}}catch(checkError){console.error(checkError);}
    toast('일정은 저장했지만 알림을 갱신하지 못했어요. 알림 상태를 확인해 주세요.');
   }else toast('일정은 저장했지만 이전 알림을 끄지 못했어요. 앱을 다시 열면 재시도해요.');
  }
}
async function pickScreenshots(){
 if(!isNativeApp()){upload.click();return;}
 try{const files=await choosePhotos();if(files.length)await acceptPickedFiles(files);}
 catch(e){console.error(e);if(e?.message==='unsupported-image-format'){toast('HEIC 등 지원하지 않는 형식이 있어요. PNG·JPG·WEBP 스크린샷을 선택해 주세요.');return;}toast('사진을 열지 못했어요. 파일 선택창을 이용해 주세요.');upload.click();}
}
async function acceptPickedFiles(fs){
 if(state.attachTarget){
  const target=items.find(i=>i.id===state.attachTarget);
  const allowed=fs.filter(f=>['image/png','image/jpeg','image/webp'].includes(f.type)&&f.size<=15*1024*1024);
  if(allowed.length!==fs.length)toast('PNG·JPG·WEBP, 한 장 15 MB 이하만 담을 수 있어요.');
  if(target&&allowed.length){target.attachments.push(...allowed.map(f=>({id:uid(),blob:f,filename:f.name,addedAt:new Date().toISOString(),fileModifiedAt:f.lastModified?new Date(f.lastModified).toISOString():null})));await persist(target);render();toast(`${allowed.length}장의 원본을 추가했어요.`);}
  state.attachTarget=null;
 }else await addFiles(fs);
}
async function addFiles(files){const allowed=Array.from(files).filter(f=>['image/png','image/jpeg','image/webp'].includes(f.type)&&f.size<=15*1024*1024);if(allowed.length!==files.length)toast('PNG·JPG·WEBP, 한 장 15 MB 이하만 담을 수 있어요.');for(const f of allowed){const a={id:uid(),blob:f,filename:f.name,addedAt:new Date().toISOString(),fileModifiedAt:f.lastModified?new Date(f.lastModified).toISOString():null};state.files.push(a);state.selected.add(a.id);}await setMeta('importQueue',state.files);render();}
async function getWorker(run){if(worker)return worker;const w=await Tesseract.createWorker('kor+eng',1,{workerPath:new URL('vendor/worker.min.js',location.href).href,corePath:new URL('vendor/core/',location.href).href,langPath:new URL('vendor/lang/',location.href).href,cachePath:'dama-kor-best-v1',workerBlobURL:false,logger:m=>{if(!state.busy)return;if(m.status==='recognizing text'){state.progress=(state.ocrIndex+m.progress)/state.ocrCount*100;state.progressText=`${state.ocrIndex+1} / ${state.ocrCount}장 · 글자를 읽고 있어요`;updateProgress();}else if(state.ocrIndex===0){state.progressText='이 기기에서 글자를 읽을 준비를 하고 있어요.';updateProgress();}}});if(run!==ocrRun){await w.terminate();throw new Error('cancelled');}worker=w;return w;}
function updateProgress(){const bar=app.querySelector('.progress-track span'),label=app.querySelector('.progress-label');if(bar)bar.style.width=Math.max(2,state.progress)+'%';if(label)label.textContent=state.progressText;}
async function recognize(){const selected=state.files.filter(a=>state.selected.has(a.id));if(!selected.length)return;const run=++ocrRun;state.busy=true;state.progress=0;state.progressText='기기 안에서 읽기를 준비해요.';state.ocrIndex=0;state.ocrCount=selected.length;render();try{const w=await getWorker(run);for(let n=0;n<selected.length;n++){state.ocrIndex=n;const a=selected[n];if(!a.ocr||a.failed){a.failed=false;try{const r=await readImage(w,a.blob,phase=>{state.progressText=phase;updateProgress();});if(run!==ocrRun)return;a.ocr=r;}catch(e){if(run!==ocrRun)return;a.failed=true;a.ocr={text:'',confidence:0};}}state.progress=(n+1)/selected.length*100;updateProgress();await setMeta('importQueue',state.files);}if(run!==ocrRun)return;state.busy=false;if(selected.every(a=>!a.ocr?.text.trim()))toast('글자를 읽지 못했어요. 원본을 보면서 직접 내용을 적을 수 있어요.');makeDraft(selected);go('review');}catch(e){if(run!==ocrRun)return;state.busy=false;render();toast('글자 인식을 시작하지 못했어요. 잠시 후 다시 시도하거나 직접 정리할 수 있어요.');console.error(e);}}
function makeDraft(attachments,existing=null){const text=attachments.map(a=>a.ocr?.text||'').join('\n\n');const s=suggest(text);const candidate=s.dates.length===1?s.dates[0]:{};state.draft={type:existing?.type|| (s.dates.length?'event':'page'),title:existing?.title||s.title,category:existing?.category||s.category,emoji:existing?.emoji||s.emoji,start:existing?.start||candidate.start||'',end:existing?.end||candidate.end||'',time:existing?.time||candidate.time||'',endTime:existing?.endTime||candidate.endTime||'',location:existing?.location||s.location||'',condition:existing?.condition||candidate.condition||'',note:existing?.note||'',summary:'',ocrText:existing?.ocrText||s.text,attachments,dates:s.dates,candidate:existing?-2:(s.dates.length===1?0:-1),confirmed:false,editId:existing?.id||null};}
function readDraft(){app.querySelectorAll('[data-draft]').forEach(el=>state.draft[el.dataset.draft]=el.value);}
function parseBlocks(summary){return summary.split('\n').map(s=>s.trim()).filter(Boolean).map(s=>s.startsWith('# ')?{type:'heading',text:s.slice(2),checked:false}:/^\[[ xX]\] /.test(s)?{type:'check',text:s.slice(4),checked:/^\[[xX]\]/.test(s)}:s.startsWith('- ')?{type:'bullet',text:s.slice(2),checked:false}:{type:'text',text:s,checked:false});}
async function saveDraft(){readDraft();const d=state.draft;if(!d.confirmed)return;if(!d.title.trim()){toast('제목을 적어주세요.');return;}if(d.type==='event'&&!d.start){toast('대표 일정의 날짜를 확인해주세요.');return;}if(d.type==='event'&&d.end&&d.end<d.start){toast('끝 날짜는 시작 날짜 이후여야 해요.');return;}if(d.type==='event'&&d.time&&d.endTime&&(!d.end||d.end===d.start)&&d.endTime<d.time){toast('끝 시간을 시작 시간 이후로 확인해주세요.');return;}const at=new Date().toISOString();const old=items.find(i=>i.id===d.editId);const i={id:old?.id||uid(),type:d.type,title:d.title.trim(),category:d.category||'정보',emoji:d.emoji||'📎',start:d.start,end:d.end||d.start,time:d.time,endTime:d.endTime,location:d.location,condition:d.condition,note:d.note,blocks:old?.blocks||[],hiddenAutoBlocks:old?hiddenAutoCount(old):0,ocrText:d.ocrText,attachments:d.attachments,reminderAt:d.type==='event'?(old?.reminderAt||''):'',notificationId:d.type==='event'?(old?.notificationId||null):null,createdAt:old?.createdAt||at,updatedAt:at};try{if(d.editId)await settleSave(d.editId);await putItem(i);await syncSavedReminder(i,old);items=old?items.map(q=>q.id===i.id?i:q):[i,...items];const saved=new Set(d.attachments.map(a=>a.id));state.files=state.files.filter(a=>!saved.has(a.id));state.selected=new Set(state.files.map(a=>a.id));await setMeta('importQueue',state.files);state.draft=null;if(!state.files.length&&worker){await worker.terminate();worker=null;}if(i.type==='event'){state.month=i.start.slice(0,7);state.day=i.start;}open(i);toast(i.type==='event'?'대표 일정 하나를 담았어요.':'선택한 이미지를 한 페이지로 담았어요.');}catch(e){storageError(e);}}
async function seed(){if(items.some(i=>i.sample)){toast('예시가 이미 담겨 있어요.');return;}const at=new Date().toISOString();const examples=[{type:'event',title:'가을의 조각들',category:'전시',emoji:'🖼️',start:'2026-10-14',end:'2026-11-08',time:'10:00',endTime:'18:00',location:'모아 갤러리 · 서울',file:'dama-exhibition.png'},{type:'event',title:'오후의 작은 음악회',category:'공연',emoji:'🎵',start:'2026-10-17',end:'2026-10-17',time:'19:00',endTime:'',location:'소담 아트홀 · 서울',file:'dama-concert.png'},{type:'page',title:'다음에 읽고 싶은 책',category:'책',emoji:'📖',file:'dama-book.png',blocks:[{type:'heading',text:'읽고 싶은 마음',checked:false},{type:'text',text:'천천히 읽으며 마음에 남는 문장을 모아보기.',checked:false},{type:'check',text:'도서관에서 찾아보기',checked:false}]},{type:'page',title:'작은 공간의 정리 아이디어',category:'정보',emoji:'🧺',file:'dama-info.png',blocks:[{type:'heading',text:'한 칸씩, 천천히',checked:false},{type:'bullet',text:'자주 쓰는 물건은 손이 닿는 곳에.',checked:false},{type:'check',text:'주말에 작은 서랍부터 정리하기',checked:false}]}];for(const q of examples){const blob=await (await fetch('assets/'+q.file)).blob();const i={id:uid(),...q,sample:true,note:'가상의 예시입니다.',blocks:q.blocks||[],createdAt:at,updatedAt:at,attachments:[{id:uid(),filename:q.file,blob,addedAt:at}],ocrText:''};delete i.file;await putItem(i);items.push(i);}state.day='2026-10-17';state.month='2026-10';render();toast('가상의 예시 4개를 담았어요.');}
async function clearSamples(){for(const i of items.filter(i=>i.sample)){await settleSave(i.id,true);if(isNativeApp()&&i.notificationId)await cancelReminder(i.notificationId).catch(console.error);await removeItem(i.id);}items=items.filter(i=>!i.sample);render();toast('예시만 지웠어요.');}
function showImage(a){const dialog=document.getElementById('image-viewer');document.getElementById('original').src=url(a);document.getElementById('image-meta').textContent=`${a.filename} · 첨부 ${stamp(a.addedAt)}`;dialog.showModal();}
async function download(blob,filename){if(isNativeApp()){await shareDocument(blob,filename);return;}const link=document.createElement('a'),u=URL.createObjectURL(blob);link.href=u;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(u),10000);}
const blobData=b=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(b);});
async function backup(){try{const copy=await Promise.all(items.map(async i=>({...i,attachments:await Promise.all(i.attachments.map(async a=>{const {blob,...rest}=a;return {...rest,data:await blobData(blob)};}))})));await download(new Blob([JSON.stringify({format:'dama-backup',version:1,exportedAt:new Date().toISOString(),items:copy})],{type:'application/json'}),`dama-backup-${today()}.json`);toast('원본을 포함한 백업 파일을 저장해요.');}catch(e){toast('백업 파일을 만들지 못했어요.');console.error(e);}}
async function importBackup(f){if(!f)return;if(f.size>180*1024*1024){toast('백업 파일은 180 MB 이하로 나눠주세요.');return;}try{await settleAllSaves();const v=JSON.parse(await f.text());if(v.format!=='dama-backup'||v.version!==1||!Array.isArray(v.items)||v.items.length>2000)throw Error('format');const clean=[];for(const q of v.items){if(!['event','page'].includes(q.type)||typeof q.title!=='string'||!Array.isArray(q.attachments)||q.attachments.length>200||!Array.isArray(q.blocks))throw Error('record');if(q.type==='event'&&(!validDay(q.start)||!validDay(q.end||q.start)||(q.end||q.start)<q.start))throw Error('date');const attachments=[];for(const a of q.attachments){if(typeof a.data!=='string'||a.data.length>22*1024*1024||!/^data:image\/(png|jpeg|webp);base64,/.test(a.data))throw Error('image');const [header,data]=a.data.split(',');const raw=atob(data),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));attachments.push({id:uid(),filename:String(a.filename||'스크린샷'),blob:new Blob([bytes],{type:header.split(':')[1].split(';')[0]}),addedAt:Number.isNaN(Date.parse(a.addedAt))?new Date().toISOString():a.addedAt,fileModifiedAt:a.fileModifiedAt||null,ocr:a.ocr?{text:String(a.ocr.text||''),confidence:Number(a.ocr.confidence)||0}:undefined});}const importedId=typeof q.id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q.id)?q.id:uid();const old=items.find(i=>i.id===importedId);if(old&&old.updatedAt>=q.updatedAt)continue;clean.push({id:importedId,type:q.type,title:q.title.slice(0,150),category:String(q.category||'정보').slice(0,30),emoji:String(q.emoji||'📎').slice(0,10),start:String(q.start||''),end:String(q.end||q.start||''),time:String(q.time||''),endTime:String(q.endTime||''),location:String(q.location||''),condition:String(q.condition||''),note:String(q.note||''),createdAt:Number.isNaN(Date.parse(q.createdAt))?new Date().toISOString():q.createdAt,updatedAt:Number.isNaN(Date.parse(q.updatedAt))?new Date().toISOString():q.updatedAt,sample:!!q.sample,ocrText:String(q.ocrText||''),blocks:q.blocks.filter(b=>['text','heading','bullet','check'].includes(b.type)).map(b=>({type:b.type,text:String(b.text||''),checked:!!b.checked})),hiddenAutoBlocks:Number.isInteger(q.hiddenAutoBlocks)?Math.max(0,Math.min(q.blocks.length,q.hiddenAutoBlocks)):(q.type==='page'&&q.ocrText?q.blocks.length:0),attachments});}if(isNativeApp())for(const q of clean){const prior=items.find(item=>item.id===q.id);if(prior?.notificationId)await cancelReminder(prior.notificationId).catch(console.error);}await putMany(clean);items=await allItems();render();toast(`${clean.length}개의 기억을 불러왔어요. 기존 기억도 함께 보관해요.`);}catch(e){toast('담아에서 만든 올바른 백업 파일인지 확인해주세요.');console.error(e);}}
async function ics(){
 const i=current(),escape=s=>String(s||'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
 const utc=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 let dates,timingNote='',allDay=false;
 if(i.time){
  const start=new Date(i.start+'T'+i.time+':00');let end;
  if(i.endTime)end=new Date((i.end||i.start)+'T'+i.endTime+':00');
  else if(i.end&&i.end>i.start){end=new Date(i.end+'T00:00:00');end.setDate(end.getDate()+1);timingNote='종료 시간이 없어 마지막 날짜의 다음 날 00:00까지로 내보냈습니다.';}
  else{end=new Date(start.getTime()+60*60*1000);timingNote='종료 시간이 없어 1시간 길이로 내보냈습니다.';}
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())){toast('날짜와 시간을 확인해주세요.');return;}
  dates='DTSTART:'+utc(start)+'\r\nDTEND:'+utc(end);
 }else{
  allDay=true;
  const end=new Date((i.end||i.start)+'T12:00:00');if(Number.isNaN(end.getTime())){toast('날짜를 확인해주세요.');return;}end.setDate(end.getDate()+1);
  dates='DTSTART;VALUE=DATE:'+i.start.replaceAll('-','')+'\r\nDTEND;VALUE=DATE:'+dayString(end).replaceAll('-','');
 }
 const safeUid=String(i.id).replace(/[^A-Za-z0-9._~-]/g,'_');
 const descriptionParts=[i.note,i.condition,timingNote];
 if(allDay)descriptionParts.push('시간을 입력하지 않은 일정은 종일 일정으로 내보냅니다.');
 const description=descriptionParts.filter(Boolean).join('\n');
 const value=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Dama//Memories//KO','BEGIN:VEVENT','UID:'+safeUid+'@dama','DTSTAMP:'+utc(new Date()),dates,'SUMMARY:'+escape(i.title),'LOCATION:'+escape(i.location),'DESCRIPTION:'+escape(description),'END:VEVENT','END:VCALENDAR'].join('\r\n')+'\r\n';
 await download(new Blob([value],{type:'text/calendar;charset=utf-8'}),i.title+'.ics');toast('캘린더 앱에서 열 수 있는 파일을 저장해요.');
}
app.addEventListener('click',async e=>{const b=e.target.closest('[data-act]');if(!b)return;const act=b.dataset.act;try{
 if(state.busy&&!['cancel-ocr','draft-image'].includes(act)){toast('읽기를 완료하거나 취소한 후 이동할 수 있어요.');return;}
 if(act==='home')go(state.mode==='drawer'?'home':'calendar');
 else if(['calendar','pages','settings'].includes(act))go(act);
 else if(act==='mode'){state.mode=b.dataset.mode;await setMeta('mode',state.mode);go(state.mode==='drawer'?'home':'calendar');}
 else if(act==='day'){state.day=b.dataset.day;render();}
 else if(act==='month'){const [y,m]=state.month.split('-').map(Number);state.month=dayString(new Date(y,m-1+Number(b.dataset.delta),1)).slice(0,7);render();}
 else if(act==='today'){state.day=today();state.month=state.day.slice(0,7);render();}
 else if(act==='open'){open(items.find(i=>i.id===b.dataset.id));}
 else if(act==='filter'){state.filter=b.dataset.filter;render();}
 else if(act==='back'){if(state.view==='detail'){const i=current();await settleSave(i.id);go(i.type==='event'?'calendar':'pages');}else{state.attachTarget=null;go(state.mode==='drawer'?'home':'calendar');}}
 else if(act==='import'){state.attachTarget=null;go('import');}
 else if(act==='choose')await pickScreenshots();
 else if(act==='select-all'){state.selected=new Set(state.files.map(a=>a.id));render();}
 else if(act==='discard-import'){state.files=[];state.selected.clear();await setMeta('importQueue',[]);render();toast('정리 중인 이미지 목록을 비웠어요.');}
 else if(act==='read')await recognize();
 else if(act==='cancel-ocr'){ocrRun++;state.busy=false;if(worker){await worker.terminate();worker=null;}render();toast('읽기를 취소했어요. 선택한 원본은 그대로 있어요.');}
 else if(act==='sample-import'){const blob=await (await fetch('assets/dama-concert.png')).blob();await addFiles([new File([blob],'가상_공연_예시.png',{type:'image/png'})]);}
 else if(act==='route'){readDraft();state.draft.type=b.dataset.type;state.draft.confirmed=false;render();}
 else if(act==='review-back'){if(state.draft?.editId)go('detail');else go('import');}

 else if(act==='save')await saveDraft();
 else if(act==='edit'){await settleSave(current().id);makeDraft(current().attachments,current());go('review');}
 else if(act==='image')showImage(current().attachments.find(a=>a.id===b.dataset.image));
 else if(act==='draft-image')showImage(state.draft.attachments.find(a=>a.id===b.dataset.image));
 else if(act==='attach'){state.attachTarget=state.active;await pickScreenshots();}
 else if(act==='add-block'){const i=current();i.hiddenAutoBlocks=hiddenAutoCount(i);i.blocks.push({type:b.dataset.type,text:'',checked:false});await persist(i);render();app.querySelector('.blocks .block:last-child textarea')?.focus();}
 else if(act==='remove-block'){const i=current(),index=Number(b.dataset.index),hidden=hiddenAutoCount(i);i.blocks.splice(index,1);i.hiddenAutoBlocks=index<hidden?hidden-1:hidden;await persist(i);render();}
 else if(act==='show-old-blocks'){const i=current();i.hiddenAutoBlocks=0;await persist(i);render();}
 else if(act==='save-reminder')await saveReminderForCurrent();
 else if(act==='remove-reminder')await removeReminderForCurrent();
 else if(act==='delete'){if(!state.deleteConfirm){state.deleteConfirm=true;render();}else{const i=current();await settleSave(i.id,true);if(isNativeApp()&&i.notificationId)await cancelReminder(i.notificationId).catch(console.error);await removeItem(i.id);items=items.filter(q=>q.id!==i.id);go(i.type==='event'?'calendar':'pages');toast('기억을 삭제했어요.');}}
 else if(act==='ics')await ics();
 else if(act==='seed')await seed();
 else if(act==='clear-samples')await clearSamples();
 else if(act==='backup'){await settleAllSaves();await backup();}
 else if(act==='restore')restore.click();
 else if(act==='persist'){const granted=await navigator.storage?.persist?.();toast(granted?'브라우저가 오래 보관 요청을 허용했어요.':'브라우저가 저장 기간을 관리해요. 백업 파일도 보관해주세요.');}
 }catch(err){storageError(err);}});
app.addEventListener('input',e=>{const el=e.target;if(el.matches('[data-block]')){current().blocks[+el.dataset.block].text=el.value;resizeBlocks();queueSave();}else if(el.matches('[data-note]')){current().note=el.value;queueSave();}else if(el.matches('[data-draft]')){const field=el.dataset.draft,previousStart=state.draft.start,previousEnd=state.draft.end;state.draft[field]=el.value;if(['start','end','time','endTime'].includes(field)){state.draft.candidate=-2;if(['start','end'].includes(field)){state.draft.condition='';const warning=app.querySelector('[data-condition-warning]');if(warning)warning.hidden=true;}if(field==='start'&&previousStart!==el.value){state.draft.end=previousEnd===previousStart?el.value:'';const endInput=app.querySelector('[data-draft="end"]');if(endInput)endInput.value=state.draft.end;}app.querySelectorAll('[data-candidate]').forEach(c=>{c.checked=false;c.closest('.candidate')?.classList.remove('selected');});const save=app.querySelector('[data-act="save"]');if(save)save.disabled=!(state.draft.confirmed&&(state.draft.type!=='event'||state.draft.start));const past=app.querySelector('[data-past-warning]');if(past)past.hidden=!(state.draft.start&&(state.draft.end||state.draft.start)<today());}}else if(el.id==='search'){state.query=el.value;const pos=el.selectionStart;render();const s=document.getElementById('search');s.focus();s.setSelectionRange(pos,pos);}});
app.addEventListener('change',e=>{const el=e.target;if(el.matches('[data-file]')){el.checked?state.selected.add(el.dataset.file):state.selected.delete(el.dataset.file);render();}else if(el.matches('[data-confirm]')){state.draft.confirmed=el.checked;readDraft();render();}else if(el.matches('[data-candidate]')){readDraft();const n=+el.dataset.candidate,c=state.draft.dates[n];Object.assign(state.draft,{candidate:n,start:c.start,end:c.end,time:c.time,endTime:c.endTime,condition:c.condition,confirmed:false});render();}else if(el.matches('[data-check]')){current().blocks[+el.dataset.check].checked=el.checked;queueSave();el.closest('.block').classList.toggle('checked',el.checked);}});
upload.addEventListener('change',async()=>{const fs=Array.from(upload.files||[]);upload.value='';await acceptPickedFiles(fs);});
restore.addEventListener('change',()=>{importBackup(restore.files?.[0]);restore.value='';});
app.addEventListener('keydown',e=>{if(e.target.id==='drop-zone'&&['Enter',' '].includes(e.key)){e.preventDefault();pickScreenshots();}});
app.addEventListener('dragover',e=>{if(state.view==='import'){e.preventDefault();document.getElementById('drop-zone')?.classList.add('dragging');}});
app.addEventListener('dragleave',()=>document.getElementById('drop-zone')?.classList.remove('dragging'));
app.addEventListener('drop',async e=>{if(state.view==='import'){e.preventDefault();if(!state.busy)await addFiles(Array.from(e.dataTransfer.files));}});
document.getElementById('close-viewer').onclick=()=>document.getElementById('image-viewer').close();
document.getElementById('image-viewer').addEventListener('click',e=>{if(e.target.tagName==='DIALOG')e.target.close();});
window.addEventListener('pagehide',()=>{const i=current();if(i&&state.view==='detail')putItem(i);});
async function init(){
 try{
  items=await allItems();state.mode=await getMeta('mode')||'calendar';state.view=state.mode==='drawer'?'home':'calendar';
  state.files=await getMeta('importQueue')||[];state.selected=new Set(state.files.map(a=>a.id));if(state.files.length)state.view='import';render();
  if(!isNativeApp()&&'serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(console.error);
  if(isNativeApp())try{
   await onReminderTap(itemId=>{const item=items.find(i=>i.id===itemId);if(item)open(item);});
    const pending=await pendingReminderIds();
    const activeIds=new Set(items.filter(item=>item.type==='event'&&item.reminderAt&&item.notificationId).map(item=>item.notificationId));
    for(const id of pending)if(!activeIds.has(id))await cancelReminder(id).catch(console.error);
   for(const item of items){if(item.type==='event'&&item.notificationId&&item.reminderAt&&new Date(item.reminderAt)>new Date()&&!pending.has(item.notificationId)){
    await scheduleReminder({id:item.notificationId,title:item.title,at:new Date(item.reminderAt).toISOString(),itemId:item.id,prompt:false}).catch(console.error);
   }}
  }catch(nativeError){console.error('iOS reminder setup failed',nativeError);}
 }catch(e){app.innerHTML='<div class="storage-error">앱 저장소를 사용할 수 없어요. 다시 실행해 주세요.</div>';console.error(e);}
}
init();
