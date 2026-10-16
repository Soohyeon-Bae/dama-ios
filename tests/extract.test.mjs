import test from 'node:test';
import assert from 'node:assert/strict';
import { suggest } from '../dist/extract.mjs';

const referenceDate = new Date('2026-10-01T00:00:00+09:00');

test('event screenshot suggests the event date and recognizable title', () => {
  const result = suggest([
    '서울야외도서관',
    '프로그램 신청현황',
    '[달빛낭만극장 with 낭만책멍] 노팅 힐',
    '행사일시 2026. 10. 03 (토)',
    '광화문 책마당'
  ].join('\n'), referenceDate);
  assert.equal(result.dates[0]?.start, '2026-10-03');
  assert.match(result.title, /달빛낭만극장.*노팅 힐/);
});

test('overnight booking keeps its date range together', () => {
  const result = suggest([
    '부산 여행 일정',
    '2026년 9월 26일 ~ 27일 · 예약 1개',
    'Lamer Hotel & Seawater Spa Busan',
    '9월 26일 15:00 - 9월 27일 11:00'
  ].join('\n'), referenceDate);
  assert.ok(result.dates.some(date => date.start === '2026-09-26' && date.end === '2026-09-27'));
  assert.match(result.title, /Lamer Hotel/);
});

test('book information without an event date stays a page', () => {
  const result = suggest('작가의 신작 소개\n빨강의 자서전\n책을 읽고 싶어요', referenceDate);
  assert.equal(result.category, '책');
  assert.equal(result.dates.length, 0);
});
