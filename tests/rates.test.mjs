import assert from 'node:assert/strict'
import test from 'node:test'
import { parseRate } from '../src/lib/money.ts'

test('shop rates accept a decimal comma and reject unsafe financial defaults', () => {
  assert.equal(parseRate('12,5'), 12.5)
  assert.equal(parseRate('1,5'), 1.5)
  assert.equal(parseRate('1.5'), 1.5)
  assert.equal(parseRate('2'), 2)
  assert.equal(parseRate('2.7000'), 2.7)
  assert.equal(parseRate('0'), 0)
  for (const input of ['Infinity', '-3', '1,000', '1,550', '12,000.00', '12abc', '']) {
    assert.throws(() => parseRate(input))
  }
})
