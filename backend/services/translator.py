import urllib.request
import urllib.parse
import json
import logging

logger = logging.getLogger("translator")

def _translate_with_gtx(text: str, target_lang: str) -> str:
    """Direct Google Translate GTX endpoint (no API key required, reliable fallback)."""
    if not text or not text.strip():
        return text
    
    # Map common language codes
    tl = target_lang.lower()
    if tl in ["zh", "zh-cn", "cn", "chinese"]:
        tl = "zh-CN"
    elif tl in ["en", "eng", "english"]:
        tl = "en"
    elif tl in ["vi", "vie", "vietnamese"]:
        tl = "vi"

    try:
        url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl={tl}&dt=t&q={urllib.parse.quote(text)}"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            if res_data and isinstance(res_data, list) and len(res_data) > 0:
                translated_parts = [segment[0] for segment in res_data[0] if segment and len(segment) > 0 and segment[0]]
                return "".join(translated_parts)
    except Exception as e:
        logger.warning(f"GTX translation error: {e}")
    return text

def translate_text(text: str, target_lang: str) -> str:
    """Translate single text using deep-translator with GTX fallback."""
    if not text or not text.strip():
        return text
    
    tl = target_lang.lower()
    if tl in ["zh", "zh-cn", "cn", "chinese"]:
        tl = "zh-CN"
    elif tl in ["en", "eng", "english"]:
        tl = "en"
    elif tl in ["vi", "vie", "vietnamese"]:
        tl = "vi"

    # Try deep-translator if available
    try:
        from deep_translator import GoogleTranslator
        res = GoogleTranslator(source="auto", target=tl).translate(text)
        if res:
            return res
    except Exception as e:
        logger.debug(f"deep_translator failed, falling back to GTX: {e}")

    # Fallback to GTX
    return _translate_with_gtx(text, tl)

def translate_video_metadata(title: str, description: str, hashtags: list, target_lang: str) -> dict:
    """Translate all metadata of a video (title, description, hashtags)."""
    translated_title = translate_text(title, target_lang) if title else ""
    translated_desc = translate_text(description, target_lang) if description else ""
    
    translated_tags = []
    if hashtags and isinstance(hashtags, list):
        for tag in hashtags:
            clean_tag = tag.lstrip("#")
            t_tag = translate_text(clean_tag, target_lang)
            # Replace whitespace in translated tag
            formatted_tag = t_tag.replace(" ", "")
            translated_tags.append(formatted_tag if formatted_tag else clean_tag)

    return {
        "title": translated_title,
        "description": translated_desc,
        "hashtags": translated_tags,
        "target_lang": target_lang
    }
