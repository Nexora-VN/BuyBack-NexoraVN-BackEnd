import { gradeActivity, validateActivity } from './activity-grading.js';

describe('activity grading', () => {
  it('grades answers rather than trusting a supplied score', () => {
    expect(gradeActivity('fill-blank', { answer: 'cat' }, { answer: 'dog', score: 100 })).toBe(0);
    expect(gradeActivity('fill-blank', { answer: 'cat' }, { answer: ' CAT ' })).toBe(100);
  });
  it('does not count repeated placements twice', () => {
    const config = { items: [{ id: 'a', targetId: 'x' }, { id: 'b', targetId: 'y' }], targets: [{ id: 'x' }, { id: 'y' }] };
    expect(gradeActivity('drag-drop', config, { placements: [{ itemId: 'a', targetId: 'x' }, { itemId: 'a', targetId: 'x' }] })).toBe(50);
  });
  it('rejects incomplete ordering definitions', () => {
    expect(() => validateActivity('sort-order', { items: [{ id: 'a' }, { id: 'b' }], order: ['a', 'a'] })).toThrow();
  });
  it('requires explicit matching answers', () => {
    expect(gradeActivity('matching-select', { pairs: [{ id: 'a', left: 'A', right: 'a' }] }, { matched: ['a'] })).toBe(0);
  });
});
