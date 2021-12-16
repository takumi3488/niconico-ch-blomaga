import { getBlogIds, getCredential } from ".";

test('getCredential is success', () => {
  expect(getCredential()).toHaveLength(2)
})

test('getBlogIds is success', () => {
  expect(getBlogIds().length).toBeGreaterThanOrEqual(1)
})
