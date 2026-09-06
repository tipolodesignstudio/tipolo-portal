#!/usr/bin/env python3
"""Hand-build a small, uncompressed, text-layer PDF that mimics a Tipolo proposal.

Only used to exercise the PDF import parser locally — no dependencies.
"""
import sys

W, H = 612, 792

# (x, y_from_top, size, bold, text)
def page1():
    L = []
    y = 90
    L.append((72, y, 9, False, "TIPOLO DESIGN STUDIO")); y += 60
    L.append((72, y, 26, True, "Rosewood Lane Courtyard")); y += 34
    L.append((72, y, 14, False, "Landscape Design Proposal")); y += 50
    L.append((72, y, 11, False, "Prepared for:  Harbourview Developments Ltd.")); y += 18
    L.append((72, y, 11, False, "Attention:  Dana Whitfield, Project Manager")); y += 18
    L.append((72, y, 11, False, "Date:  March 14, 2026")); y += 46

    L.append((72, y, 14, True, "PROJECT UNDERSTANDING")); y += 22
    for t in [
        "Harbourview Developments is redeveloping the courtyard at 1180 Rosewood Lane into a",
        "shared amenity space for residents. The existing asphalt surface, failing retaining wall",
        "and mature cedar hedge along the north property line all need to be addressed.",
        "We understand the goal is a planted courtyard with generous seating, permeable paving,",
        "and an irrigation system that can be zoned for the raised planters.",
    ]:
        L.append((72, y, 10.5, False, t)); y += 15
    y += 20

    L.append((72, y, 14, True, "SCOPE OF WORK")); y += 22
    for t in [
        "Site inventory and analysis, including an arborist review of the existing cedar hedge.",
        "Concept design: two planting and hardscape options presented for your selection.",
        "Design development of the preferred concept, including grading and stormwater notes.",
        "Construction documentation: layout plan, planting plan, details and specifications.",
        "Tender support and site review during construction.",
    ]:
        L.append((72, y, 10.5, False, "•  " + t)); y += 16
    return L


def page2():
    L = []
    y = 90
    L.append((72, y, 14, True, "DELIVERABLES")); y += 22
    for t in [
        "Two concept boards at 1:100 with a planting palette and precedent imagery.",
        "A dimensioned layout plan, planting plan and grading plan at 1:50.",
        "A detail set covering the retaining wall, paving edges and planter construction.",
        "An outline specification and a planting schedule with sizes and quantities.",
    ]:
        L.append((72, y, 10.5, False, "•  " + t)); y += 16
    y += 26

    L.append((72, y, 14, True, "FEE SCHEDULE")); y += 24
    rows = [
        ("Site inventory and analysis", "$2,400.00"),
        ("Concept design (2 options)", "$6,800.00"),
        ("Design development", "$5,250.00"),
        ("Construction documentation", "$9,400.00"),
        ("Site review visits (6)", "$3,600.00"),
    ]
    for desc, amt in rows:
        L.append((72, y, 10.5, False, desc))
        L.append((450, y, 10.5, False, amt))
        y += 17
    y += 8
    L.append((72, y, 10.5, True, "Subtotal"))
    L.append((450, y, 10.5, True, "$27,450.00")); y += 17
    L.append((72, y, 10.5, False, "GST (5%)"))
    L.append((450, y, 10.5, False, "$1,372.50")); y += 17
    L.append((72, y, 10.5, True, "Total"))
    L.append((450, y, 10.5, True, "$28,822.50")); y += 40

    L.append((72, y, 14, True, "TERMS")); y += 22
    for t in [
        "Fees are quoted in Canadian dollars and exclude applicable taxes and disbursements.",
        "Invoices are issued monthly against progress and are due within 30 days.",
        "This proposal is valid for 90 days from the date above.",
    ]:
        L.append((72, y, 10.5, False, t)); y += 15
    return L


def esc(s):
    s = s.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
    return s.replace("•", r"\225")  # bullet, WinAnsiEncoding


def stream_for(lines):
    out = []
    for x, ytop, size, bold, text in lines:
        font = "/F2" if bold else "/F1"
        y = H - ytop
        out.append(f"BT {font} {size} Tf 1 0 0 1 {x} {y:.1f} Tm ({esc(text)}) Tj ET")
    return "\n".join(out).encode("latin-1", "replace")


def build(path):
    pages = [page1(), page2()]
    objs = {}
    n_pages = len(pages)
    # 1 catalog, 2 pages, then per page: page obj + content obj, then 2 fonts
    page_ids = [3 + 2 * i for i in range(n_pages)]
    content_ids = [4 + 2 * i for i in range(n_pages)]
    f1 = 3 + 2 * n_pages
    f2 = f1 + 1

    objs[1] = b"<< /Type /Catalog /Pages 2 0 R >>"
    kids = " ".join(f"{i} 0 R" for i in page_ids)
    objs[2] = f"<< /Type /Pages /Kids [{kids}] /Count {n_pages} >>".encode()
    for i, lines in enumerate(pages):
        objs[page_ids[i]] = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {W} {H}] "
            f"/Resources << /Font << /F1 {f1} 0 R /F2 {f2} 0 R >> >> "
            f"/Contents {content_ids[i]} 0 R >>").encode()
        data = stream_for(lines)
        objs[content_ids[i]] = (
            f"<< /Length {len(data)} >>\nstream\n".encode() + data + b"\nendstream")
    objs[f1] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
    objs[f2] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"

    buf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = {}
    for num in sorted(objs):
        offsets[num] = len(buf)
        buf += f"{num} 0 obj\n".encode() + objs[num] + b"\nendobj\n"

    xref_at = len(buf)
    count = max(objs) + 1
    buf += f"xref\n0 {count}\n".encode()
    buf += b"0000000000 65535 f \n"
    for num in range(1, count):
        buf += f"{offsets[num]:010d} 00000 n \n".encode()
    buf += f"trailer\n<< /Size {count} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n".encode()

    with open(path, "wb") as fh:
        fh.write(buf)
    print(f"wrote {path} ({len(buf)} bytes, {n_pages} pages)")


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else "sample-proposal.pdf")
