import { DELIVERY_TRANSITIONS } from '../repos/deliveryRepo';
import { llmEnabled } from '../services/llmService';

describe('delivery lifecycle transitions', () => {
  test('valid forward transitions', () => {
    expect(DELIVERY_TRANSITIONS.pending_assignment).toContain('assigned');
    expect(DELIVERY_TRANSITIONS.assigned).toContain('accepted');
    expect(DELIVERY_TRANSITIONS.accepted).toContain('picked_up');
    expect(DELIVERY_TRANSITIONS.picked_up).toContain('in_transit');
    expect(DELIVERY_TRANSITIONS.in_transit).toContain('delivered');
  });

  test('terminal states have no onward transitions', () => {
    expect(DELIVERY_TRANSITIONS.delivered).toHaveLength(0);
    expect(DELIVERY_TRANSITIONS.cancelled).toHaveLength(0);
  });

  test('cannot skip straight to delivered', () => {
    expect(DELIVERY_TRANSITIONS.assigned).not.toContain('delivered');
  });
});

describe('LLM gating', () => {
  test('disabled when no API key is configured', () => {
    const prev = { a: process.env.ANTHROPIC_API_KEY, o: process.env.OPENAI_API_KEY };
    delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY;
    expect(llmEnabled()).toBe(false);
    if (prev.a) process.env.ANTHROPIC_API_KEY = prev.a;
    if (prev.o) process.env.OPENAI_API_KEY = prev.o;
  });
});
