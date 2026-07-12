export type ImportDiagnosticCode =
  | "unsupported-format"
  | "malformed-score"
  | "resource-limit-exceeded"
  | "mxl-container-missing"
  | "mxl-rootfile-missing"
  | "empty-score"
  | "no-playable-timeline"
  | "core-structure-mismatch";

export type ImportDiagnostic = {
  code: ImportDiagnosticCode;
  severity: "info" | "warning" | "error";
  summary: string;
  context?: Record<string, string | number | boolean>;
};

const definitions: Record<ImportDiagnosticCode, Omit<ImportDiagnostic, "code" | "context">> = {
  "unsupported-format": { severity: "error", summary: "不支持这种乐谱格式。" },
  "malformed-score": { severity: "error", summary: "乐谱文件已损坏或结构无效。" },
  "resource-limit-exceeded": { severity: "error", summary: "乐谱超出安全资源限制。" },
  "mxl-container-missing": { severity: "error", summary: "MXL 容器缺少必要的描述文件。" },
  "mxl-rootfile-missing": { severity: "error", summary: "MXL 容器引用的乐谱不存在。" },
  "empty-score": { severity: "warning", summary: "乐谱没有可显示的音乐结构。" },
  "no-playable-timeline": { severity: "warning", summary: "乐谱可以查看，但当前无法播放。" },
  "core-structure-mismatch": { severity: "error", summary: "导入后的核心音乐结构与源文件不一致。" },
};

export function createImportDiagnostic(
  code: ImportDiagnosticCode,
  context?: ImportDiagnostic["context"],
): ImportDiagnostic {
  return context === undefined ? { code, ...definitions[code] } : { code, ...definitions[code], context };
}

export class ImportPreflightError extends Error {
  constructor(
    public readonly code: ImportDiagnosticCode,
    message = code,
  ) {
    super(message);
    this.name = "ImportPreflightError";
  }
}
