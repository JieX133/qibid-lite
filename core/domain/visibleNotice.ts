// Copyright (c) 2026 中山市零启数字科技有限公司. All rights reserved.

export const OCR_DICT_MISMATCH = "本机识别字典与模型对不上，请到设置重新安装本机识别";
export const OCR_RECOGNITION_FAILED = "本机识别失败，请改用能看图的模型，或到设置重新安装本机识别";

const OCR_DICT_EN = /charactersDictionary|Recognition CTC|output classes|CTC blank|model output classes/i;
const OCR_RUNTIME_EN = /paddleocr|onnxruntime|PP-OCR|Recognition /i;

/** 看标说明 / 界面备注：英文 OCR 运行时报错收成中文可操作提示。 */
export function visibleRuntimeNotice(message: string): string {
  if (message === OCR_DICT_MISMATCH || message === OCR_RECOGNITION_FAILED) return message;
  if (OCR_DICT_EN.test(message)) return OCR_DICT_MISMATCH;
  if (OCR_RUNTIME_EN.test(message) || (/[A-Za-z]{4,}/.test(message) && !/[\u3400-\u9fff]/.test(message) && /ocr|onnx|dictionary|Recognition/i.test(message))) {
    return OCR_RECOGNITION_FAILED;
  }
  return message;
}
