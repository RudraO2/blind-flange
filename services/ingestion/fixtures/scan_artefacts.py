"""Turn a clean page render into something that looks like it came off a scanner.

A clean render makes OCR look easier than it is, so every page produced for the
fixtures is put through this module before it is written out: slight skew,
softened edges, uneven contrast from an imperfect lamp, and speckle.

Only numpy and the standard library are used here. The PNG and PDF writers are
hand-rolled rather than taken from Pillow, whose licence (MIT-CMU) sits outside
the allow-list in ``docs/licence-policy.md``, and widening that list is an
ADR-level decision rather than one made at the point of use.

That keeps Pillow out of *this* module's imports. It does **not** keep it out of
the dependency tree: ReportLab, which composes the clean page, imports Pillow at
module load. See ``../LICENCES.md`` — the licence question is open, not avoided.
"""

from __future__ import annotations

import math
import struct
import zlib

import numpy as np

WHITE = 255.0


def skew(page: np.ndarray, degrees: float) -> np.ndarray:
    """Rotate the page by a fraction of a degree, the way a sheet sits crooked.

    Sampling runs backwards from the destination pixel through the inverse
    rotation, so every output pixel is filled exactly once. Anything that maps
    outside the source is paper white rather than black.
    """
    height, width = page.shape
    theta = math.radians(degrees)
    cos_t, sin_t = math.cos(theta), math.sin(theta)
    centre_y, centre_x = (height - 1) / 2.0, (width - 1) / 2.0

    rows = np.arange(height, dtype=np.float32)[:, None] - centre_y
    cols = np.arange(width, dtype=np.float32)[None, :] - centre_x

    source_x = cos_t * cols + sin_t * rows + centre_x
    source_y = -sin_t * cols + cos_t * rows + centre_y

    inside = (
        (source_x >= 0) & (source_x <= width - 1) & (source_y >= 0) & (source_y <= height - 1)
    )
    np.clip(source_x, 0, width - 1, out=source_x)
    np.clip(source_y, 0, height - 1, out=source_y)

    x0 = np.floor(source_x).astype(np.int32)
    y0 = np.floor(source_y).astype(np.int32)
    x1 = np.minimum(x0 + 1, width - 1)
    y1 = np.minimum(y0 + 1, height - 1)
    fx = (source_x - x0).astype(np.float32)
    fy = (source_y - y0).astype(np.float32)

    top = page[y0, x0] * (1 - fx) + page[y0, x1] * fx
    bottom = page[y1, x0] * (1 - fx) + page[y1, x1] * fx
    rotated = top * (1 - fy) + bottom * fy

    return np.where(inside, rotated, WHITE).astype(np.float32)


def soften(page: np.ndarray, radius: int) -> np.ndarray:
    """Separable box blur, run twice, which is close enough to a lens blur.

    Two box passes approximate a Gaussian well enough for edge softening and
    cost two cumulative sums per axis instead of a convolution.
    """
    blurred = page
    for _ in range(2):
        blurred = _box_blur_axis(blurred, radius, axis=1)
        blurred = _box_blur_axis(blurred, radius, axis=0)
    return blurred


def _box_blur_axis(page: np.ndarray, radius: int, axis: int) -> np.ndarray:
    if radius < 1:
        return page
    width = 2 * radius + 1
    padded = np.pad(page, [(radius, radius) if a == axis else (0, 0) for a in (0, 1)], mode="edge")
    cumulative = np.cumsum(padded, axis=axis, dtype=np.float32)
    zero = np.zeros([1 if a == axis else s for a, s in enumerate(cumulative.shape)], np.float32)
    cumulative = np.concatenate([zero, cumulative], axis=axis)
    upper = np.take(cumulative, np.arange(width, width + page.shape[axis]), axis=axis)
    lower = np.take(cumulative, np.arange(0, page.shape[axis]), axis=axis)
    return (upper - lower) / width


def uneven_lamp(page: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Multiply the page by a smooth illumination field and a lid shadow.

    A flatbed lamp is never even and the lid never closes flat, so one edge
    always runs darker than the other. Both are low frequency, which is exactly
    the kind of contrast variation that costs OCR its easy thresholding.
    """
    height, width = page.shape
    coarse = rng.uniform(0.86, 1.04, size=(6, 5)).astype(np.float32)
    field = _bilinear_upsample(coarse, height, width)

    shadow_span = np.linspace(0.90, 1.0, width, dtype=np.float32)[None, :]
    edge_span = np.linspace(0.94, 1.0, height, dtype=np.float32)[:, None]

    return page * field * shadow_span * edge_span


def _bilinear_upsample(grid: np.ndarray, height: int, width: int) -> np.ndarray:
    grid_h, grid_w = grid.shape
    ys = np.linspace(0, grid_h - 1, height, dtype=np.float32)
    xs = np.linspace(0, grid_w - 1, width, dtype=np.float32)
    y0 = np.floor(ys).astype(np.int32)
    x0 = np.floor(xs).astype(np.int32)
    y1 = np.minimum(y0 + 1, grid_h - 1)
    x1 = np.minimum(x0 + 1, grid_w - 1)
    fy = (ys - y0)[:, None]
    fx = (xs - x0)[None, :]

    top = grid[np.ix_(y0, x0)] * (1 - fx) + grid[np.ix_(y0, x1)] * fx
    bottom = grid[np.ix_(y1, x0)] * (1 - fx) + grid[np.ix_(y1, x1)] * fx
    return top * (1 - fy) + bottom * fy


def speckle(page: np.ndarray, rng: np.random.Generator, sigma: float = 2.2) -> np.ndarray:
    """Sensor grain plus the dust and toner flecks a real scan carries."""
    grainy = page + rng.normal(0.0, sigma, size=page.shape).astype(np.float32)

    dust = rng.random(page.shape) < 0.0009
    grainy[dust] -= rng.uniform(60, 160, size=int(dust.sum())).astype(np.float32)

    dropout = (rng.random(page.shape) < 0.008) & (page < 128)
    grainy[dropout] += rng.uniform(70, 150, size=int(dropout.sum())).astype(np.float32)

    return grainy


def quantise(page: np.ndarray, step: int = 4) -> np.ndarray:
    """Collapse the tonal range, the way a scanner's own compression does.

    A scanner nominally delivers eight bits per pixel but never that many
    distinct levels once its pipeline has been through them. Reproducing that
    keeps the page honest and costs the committed fixture roughly half its bytes,
    because the grain no longer occupies every code value.
    """
    return (page // step) * step


def scan(page: np.ndarray, rng: np.random.Generator, degrees: float, radius: int) -> np.ndarray:
    """Run the whole degradation in the order a scanner applies it."""
    degraded = skew(page.astype(np.float32), degrees)
    degraded = soften(degraded, radius)
    degraded = uneven_lamp(degraded, rng)
    degraded = speckle(degraded, rng)
    return quantise(np.clip(degraded, 0, 255).astype(np.uint8))


def write_png(path, page: np.ndarray, dpi: int) -> None:
    """Write an 8-bit greyscale PNG, carrying the resolution in a pHYs chunk.

    Tesseract reads pHYs and warns when a page claims an implausible DPI, so
    recording it here saves the ingestion service from having to assert it.
    """
    height, width = page.shape
    unfiltered = np.hstack([np.zeros((height, 1), np.uint8), page]).tobytes()

    above = np.vstack([np.zeros((1, width), np.int16), page[:-1].astype(np.int16)])
    up_delta = ((page.astype(np.int16) - above) % 256).astype(np.uint8)
    up_filtered = np.hstack([np.full((height, 1), 2, np.uint8), up_delta]).tobytes()

    body = min(
        zlib.compress(unfiltered, 9),
        zlib.compress(up_filtered, 9),
        key=len,
    )

    pixels_per_metre = int(round(dpi / 0.0254))
    chunks = [
        _png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)),
        _png_chunk(b"pHYs", struct.pack(">IIB", pixels_per_metre, pixels_per_metre, 1)),
        _png_chunk(b"IDAT", body),
        _png_chunk(b"IEND", b""),
    ]
    with open(path, "wb") as handle:
        handle.write(b"\x89PNG\r\n\x1a\n")
        for chunk in chunks:
            handle.write(chunk)


def _png_chunk(kind: bytes, payload: bytes) -> bytes:
    return (
        struct.pack(">I", len(payload))
        + kind
        + payload
        + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
    )


def write_scan_pdf(path, pages: list[np.ndarray], dpi: int) -> None:
    """Wrap the degraded page rasters in an image-only PDF.

    This is what a scanned report actually arrives as: no text layer, one
    greyscale image per page. Story 4.4 hands it to the ingestion service.
    """
    objects: list[bytes] = []

    def add(body: bytes) -> int:
        objects.append(body)
        return len(objects)

    add(b"")  # catalog, back-filled once the page object numbers are known
    add(b"")  # page tree, likewise

    page_numbers: list[int] = []
    for page in pages:
        height, width = page.shape
        point_w = width * 72.0 / dpi
        point_h = height * 72.0 / dpi

        raster = zlib.compress(page.tobytes(), 9)
        image_number = add(
            b"<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceGray "
            b"/BitsPerComponent 8 /Filter /FlateDecode /Length %d >>\nstream\n%s\nendstream"
            % (width, height, len(raster), raster)
        )
        content = b"q %.2f 0 0 %.2f 0 0 cm /Im0 Do Q" % (point_w, point_h)
        content_number = add(
            b"<< /Length %d >>\nstream\n%s\nendstream" % (len(content), content)
        )
        page_numbers.append(
            add(
                b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2f %.2f] "
                b"/Resources << /XObject << /Im0 %d 0 R >> >> /Contents %d 0 R >>"
                % (point_w, point_h, image_number, content_number)
            )
        )

    kids = b" ".join(b"%d 0 R" % number for number in page_numbers)
    objects[0] = b"<< /Type /Catalog /Pages 2 0 R >>"
    objects[1] = b"<< /Type /Pages /Kids [%s] /Count %d >>" % (kids, len(page_numbers))

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % number + body + b"\nendobj\n"

    xref_at = len(out)
    out += b"xref\n0 %d\n" % (len(objects) + 1)
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += b"%010d 00000 n \n" % offset
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objects) + 1,
        xref_at,
    )

    with open(path, "wb") as handle:
        handle.write(bytes(out))
