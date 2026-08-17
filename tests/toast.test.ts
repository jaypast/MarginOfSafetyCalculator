import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __getToastStateForTests,
  __resetToastStateForTests,
  DEFAULT_TOAST_DURATION,
  toast,
} from '../client/src/hooks/use-toast';

describe('toast lifetime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetToastStateForTests();
  });

  afterEach(() => {
    __resetToastStateForTests();
    vi.useRealTimers();
  });

  it('automatically removes a destructive toast after the default duration', () => {
    toast({
      title: 'Stock not found',
      description: 'Could not load this ticker.',
      variant: 'destructive',
    });

    expect(__getToastStateForTests().toasts).toHaveLength(1);
    expect(__getToastStateForTests().toasts[0].open).toBe(true);

    vi.advanceTimersByTime(DEFAULT_TOAST_DURATION - 1);
    expect(__getToastStateForTests().toasts[0].open).toBe(true);

    vi.advanceTimersByTime(301);
    expect(__getToastStateForTests().toasts).toHaveLength(0);
  });

  it('keeps an explicit shorter duration for success messages', () => {
    toast({
      title: 'Done',
      duration: 1000,
    });

    vi.advanceTimersByTime(1000);
    expect(__getToastStateForTests().toasts[0].open).toBe(false);
  });
});