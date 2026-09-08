import { BadRequestException } from '@nestjs/common';

type Item = Record<string, unknown>;
const rows = (value: unknown): Item[] => Array.isArray(value) ? value.filter((v): v is Item => !!v && typeof v === 'object') : [];
export function validateActivity(type: string, config: Item): void {
  const valid = type === 'matching-select' ? rows(config.pairs).length > 0 && rows(config.pairs).every(p => p.id && p.left && p.right)
    : type === 'multiple-choice' ? rows(config.options).length >= 2 && rows(config.options).some(o => o.correct === true)
    : type === 'fill-blank' ? typeof config.answer === 'string' && config.answer.trim().length > 0
    : type === 'drag-drop' ? rows(config.items).length > 0 && rows(config.targets).length > 0 && rows(config.items).every(i => rows(config.targets).some(t => t.id === i.targetId))
    : type === 'sort-order' ? rows(config.items).length >= 2 && Array.isArray(config.order) && config.order.length === rows(config.items).length && new Set(config.order).size === config.order.length && config.order.every(id => rows(config.items).some(i => i.id === id))
    : ['reveal', 'flash-card'].includes(type) && typeof (config.answer ?? config.back) === 'string';
  if (!valid) throw new BadRequestException('Cấu hình không hợp lệ cho template đã chọn');
}

export function gradeActivity(type: string, config: Item, answer: Item): number {
  validateActivity(type, config);
  if (type === 'fill-blank') return typeof answer.answer === 'string' && answer.answer.trim().toLowerCase() === (config.answer as string).trim().toLowerCase() ? 100 : 0;
  if (type === 'multiple-choice') return rows(config.options).some(o => o.id === answer.choice && o.correct === true) ? 100 : 0;
  if (type === 'matching-select') {
    const pairs = rows(config.pairs); const submitted = rows(answer.pairs);
    return Math.round(100 * pairs.filter(p => submitted.some(s => s.left === p.id && s.right === p.id)).length / pairs.length);
  }
  if (type === 'drag-drop') {
    const items = rows(config.items); const placements = rows(answer.placements);
    return Math.round(100 * items.filter(i => placements.some(p => p.itemId === i.id && p.targetId === i.targetId)).length / items.length);
  }
  if (type === 'sort-order') {
    const expected = config.order as unknown[]; const actual = Array.isArray(answer.order) ? answer.order : [];
    return Math.round(100 * expected.filter((id, i) => id === actual[i]).length / expected.length);
  }
  return answer.revealed === true ? 100 : 0;
}
