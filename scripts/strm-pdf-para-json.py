#!/usr/bin/env python3
"""Extrai as tabelas dos PDFs do STRM do SCF (quando a versão não vem em Excel) para um JSON que o
scripts/strm-para-sql.mjs lê no lugar da pasta de .xlsx.

Uso: python3 scripts/strm-pdf-para-json.py <pasta-dos-pdf> <saida.json>   (requer: pip install pdfplumber)
Saída: {"scf-strm-<id>.pdf": [linhas no formato da planilha: topo com Focal Document, cabeçalho, dados]}
"""
import glob, json, os, sys
from multiprocessing import Pool

import pdfplumber

# Cada página repete o topo do documento; essas linhas não são dado e quebrariam a herança do item.
TOPO = ("NIST IR 8477", "Reference", "Focal Document")


def ler(caminho):
    cab, dados, nome, ref = None, [], "", ""
    with pdfplumber.open(caminho) as pdf:
        for pagina in pdf.pages:
            for tabela in pagina.extract_tables():
                for r in tabela:
                    r = [(c or "").replace("\n", " ").strip() for c in r]
                    if not any(r):
                        continue
                    if "SCF #" in r:
                        cab = r
                        continue
                    if r[0].startswith(TOPO):
                        for i, c in enumerate(r[:-1]):
                            if c.startswith("Focal Document:") and not nome:
                                nome = r[i + 1]
                            if c.startswith("Secure Controls Framework (SCF) version") and not ref:
                                ref = c
                        ref = ref or next((c for c in r if "Secure Controls Framework (SCF) version" in c), "")
                        continue
                    if cab and len(r) == len(cab):
                        dados.append(r)
    if not cab:
        raise SystemExit(f"{os.path.basename(caminho)}: cabeçalho não reconhecido (falta SCF #)")
    return os.path.basename(caminho), [["Focal Document:", nome], ["Reference document:", ref], [], [], cab, *dados]


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("uso: python3 scripts/strm-pdf-para-json.py <pasta-dos-pdf> <saida.json>")
    arquivos = sorted(glob.glob(os.path.join(sys.argv[1], "scf-strm-*.pdf")))
    if not arquivos:
        sys.exit(f"nenhum scf-strm-*.pdf em {sys.argv[1]}")
    with Pool() as p:
        resultado = dict(p.map(ler, arquivos, chunksize=1))
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False)
    print(f"{len(resultado)} PDFs → {sys.argv[2]}")
