export class PerformanceMonitor {
  private static measurements: Map<string, number> = new Map();

  static startMeasure(label: string): void {
    this.measurements.set(label, performance.now());
  }

  static endMeasure(label: string): number | null {
    const startTime = this.measurements.get(label);
    if (!startTime) {
      console.warn(`No start time found for measurement: ${label}`);
      return null;
    }

    const duration = performance.now() - startTime;
    this.measurements.delete(label);

    if (duration > 1000) {
      console.warn(`Slow operation detected: ${label} took ${duration.toFixed(2)}ms`);
    }

    return duration;
  }

  static logMetric(metricName: string, value: number, unit: string = 'ms'): void {
    if (import.meta.env.DEV) {
      console.log(`[Performance] ${metricName}: ${value.toFixed(2)}${unit}`);
    }
  }

  static measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    this.startMeasure(label);
    return fn().finally(() => {
      const duration = this.endMeasure(label);
      if (duration !== null) {
        this.logMetric(label, duration);
      }
    });
  }
}

export function withPerformanceTracking<T extends (...args: unknown[]) => unknown>(
  fn: T,
  label: string
): T {
  return ((...args: unknown[]) => {
    PerformanceMonitor.startMeasure(label);
    try {
      const result = fn(...args);
      if (result instanceof Promise) {
        return result.finally(() => PerformanceMonitor.endMeasure(label));
      }
      PerformanceMonitor.endMeasure(label);
      return result;
    } catch (error) {
      PerformanceMonitor.endMeasure(label);
      throw error;
    }
  }) as T;
}
