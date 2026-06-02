"""
attachment_handler.py
---------------------
Downloads attachments from Gmail and extracts text from them.

Handles:
  - PDF  → text via pdfplumber
  - XLSX / XLS → text via openpyxl / xlrd
  - DOCX → text via python-docx
  - Plain .txt / .csv → direct decode

Workers call extract_attachment_text(service, message_id) to get
all attachment text as a single concatenated string.
"""

import base64
import io
from logging_setup import get_logger

logger = get_logger(__name__)


def _download_attachment(service, message_id: str, attachment_id: str) -> bytes:
    """Download raw attachment bytes from Gmail API."""
    result = (
        service.users()
        .messages()
        .attachments()
        .get(userId="me", messageId=message_id, id=attachment_id)
        .execute()
    )
    data = result.get("data", "")
    return base64.urlsafe_b64decode(data + "==")


def _extract_from_pdf(data: bytes) -> str:
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            pages = [p.extract_text() or "" for p in pdf.pages]
        return "\n".join(pages)
    except ImportError:
        logger.warning("pdfplumber not installed — skipping PDF. Run: pip install pdfplumber")
        return ""
    except Exception as exc:
        logger.warning("PDF extraction failed: %s", exc)
        return ""


def _extract_from_xlsx(data: bytes) -> str:
    try:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        rows = []
        for ws in wb.worksheets:
            for row in ws.iter_rows(values_only=True):
                cells = [str(c) for c in row if c is not None]
                if cells:
                    rows.append("\t".join(cells))
        return "\n".join(rows)
    except ImportError:
        logger.warning("openpyxl not installed — skipping XLSX. Run: pip install openpyxl")
        return ""
    except Exception as exc:
        logger.warning("XLSX extraction failed: %s", exc)
        return ""


def _extract_from_docx(data: bytes) -> str:
    try:
        from docx import Document
        doc = Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except ImportError:
        logger.warning("python-docx not installed — skipping DOCX. Run: pip install python-docx")
        return ""
    except Exception as exc:
        logger.warning("DOCX extraction failed: %s", exc)
        return ""


def extract_attachment_text(service, message_id: str, payload: dict) -> str:
    """
    Walk the message payload tree, find all attachments,
    download and extract text from each.
    Returns concatenated text from all attachments.
    """
    texts = []

    def walk(part: dict):
        filename = part.get("filename", "")
        body     = part.get("body", {})
        attachment_id = body.get("attachmentId")

        if filename and attachment_id:
            ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
            logger.info("  → extracting attachment: %s (%s)", filename, ext)

            try:
                raw = _download_attachment(service, message_id, attachment_id)
            except Exception as exc:
                logger.warning("  → download failed for %s: %s", filename, exc)
                return

            if ext == "pdf":
                text = _extract_from_pdf(raw)
            elif ext in ("xlsx", "xls"):
                text = _extract_from_xlsx(raw)
            elif ext in ("docx", "doc"):
                text = _extract_from_docx(raw)
            elif ext in ("txt", "csv"):
                text = raw.decode("utf-8", errors="replace")
            else:
                logger.debug("  → unsupported attachment type: %s", ext)
                text = ""

            if text.strip():
                texts.append(f"[Attachment: {filename}]\n{text.strip()}")

        for subpart in part.get("parts", []):
            walk(subpart)

    walk(payload)
    return "\n\n".join(texts)
