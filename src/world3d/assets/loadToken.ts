// 비동기 로드 취소 토큰: 장면이 닫힌 뒤 도착한 응답을 폐기한다 (설계문서 7.3, V07)
export class LoadToken {
  private cancelled = false;
  cancel() { this.cancelled = true; }
  get isCancelled() { return this.cancelled; }
  /** 취소되었으면 결과를 dispose 하고 null 반환 */
  async guard<T>(p: Promise<T>, dispose?: (v: T) => void): Promise<T | null> {
    const v = await p;
    if (this.cancelled) { dispose?.(v); return null; }
    return v;
  }
}
