#!/usr/bin/env bash
# fetch.sh <url> <name> — download a page or PDF and leave <name>.txt beside it
S=${RESEARCH_TMP:-/tmp/intake-research}; mkdir -p $S; K=$(dirname "$0"); url="$1"; name="$2"
curl -sSL -k -A "Mozilla/5.0 (Macintosh) Chrome/130" -o "$S/raw-$name" "$url" || exit 1
if file "$S/raw-$name" | grep -q PDF; then
  "${RESEARCH_VENV:-$S/venv}/bin/python" "$K/pdftext.py" "$S/raw-$name" "$S/$name.txt"
else
  "${RESEARCH_VENV:-$S/venv}/bin/python" - "$S/raw-$name" "$S/$name.txt" <<'PY'
import sys,re,html
b=open(sys.argv[1],'rb').read()
for enc in ('utf-8','euc-kr','cp949'):
    try: t=b.decode(enc); break
    except: pass
t=re.sub(r'(?is)<(script|style).*?</\1>','',t); t=re.sub(r'(?i)<br\s*/?>|</(p|div|tr|li|h\d)>','\n',t); t=re.sub(r'<[^>]+>',' ',t)
t=html.unescape(t); t=re.sub(r'[ \t\xa0]+',' ',t); t=re.sub(r'\n\s*\n+','\n',t)
open(sys.argv[2],'w').write(t); print(len(t),'chars')
PY
fi
