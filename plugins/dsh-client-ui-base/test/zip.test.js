/**
 * Tests for the dependency-free ZIP writer (`lib/deliverables/zip.js`),
 * Story 5.4. Round-trips every entry through `node:zlib`'s own inflate and
 * `crc32` — an independent reader of what `createZip` wrote, not the same
 * code checking itself.
 *
 *     node --test plugins/dsh-client-ui-base/test/
 */

import assert from "node:assert/strict";
import test from "node:test";
import { crc32, inflateRawSync } from "node:zlib";
import { createZip } from "../lib/deliverables/zip.js";

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

/** Minimal independent reader: walks local file headers by the length fields, not by re-deriving offsets the writer already computed. */
function readEntries(zip) {
	const entries = [];
	let offset = 0;
	while (offset < zip.length && zip.readUInt32LE(offset) === LOCAL_FILE_HEADER_SIGNATURE) {
		const compressionMethod = zip.readUInt16LE(offset + 8);
		const crc = zip.readUInt32LE(offset + 14);
		const compressedSize = zip.readUInt32LE(offset + 18);
		const uncompressedSize = zip.readUInt32LE(offset + 22);
		const nameLength = zip.readUInt16LE(offset + 26);
		const extraLength = zip.readUInt16LE(offset + 28);
		const nameStart = offset + 30;
		const name = zip.toString("ascii", nameStart, nameStart + nameLength);
		const dataStart = nameStart + nameLength + extraLength;
		const compressed = zip.subarray(dataStart, dataStart + compressedSize);
		entries.push({ name, compressionMethod, crc, uncompressedSize, compressed });
		offset = dataStart + compressedSize;
	}
	return entries;
}

test("round-trips a single entry through an independent reader", () => {
	const data = Buffer.from("hello, blind flange", "utf8");
	const zip = createZip([{ name: "hello.txt", data }]);
	const entries = readEntries(zip);
	assert.equal(entries.length, 1);
	assert.equal(entries[0].name, "hello.txt");
	assert.equal(entries[0].compressionMethod, 8, "must use DEFLATE");
	assert.equal(entries[0].uncompressedSize, data.length);
	assert.deepEqual(inflateRawSync(entries[0].compressed), data);
	assert.equal(entries[0].crc, crc32(data), "recorded CRC-32 must match the uncompressed bytes");
});

test("preserves multiple entries in the order given", () => {
	const zip = createZip([
		{ name: "[Content_Types].xml", data: Buffer.from("<Types/>", "utf8") },
		{ name: "word/document.xml", data: Buffer.from("<w:document/>", "utf8") },
	]);
	const entries = readEntries(zip);
	assert.deepEqual(entries.map((entry) => entry.name), ["[Content_Types].xml", "word/document.xml"]);
	assert.deepEqual(inflateRawSync(entries[1].compressed).toString("utf8"), "<w:document/>");
});

test("an entry that does not compress smaller still round-trips", () => {
	// A few random-ish bytes deflate can't shrink; exercises the real
	// compressed-size path rather than only the friendly text case above.
	const data = Buffer.from([1, 250, 3, 249, 5, 248, 7, 247, 9, 246]);
	const zip = createZip([{ name: "bin", data }]);
	const [entry] = readEntries(zip);
	assert.deepEqual(inflateRawSync(entry.compressed), data);
});

test("ends with a valid central directory and end-of-central-directory record", () => {
	const zip = createZip([
		{ name: "a.xml", data: Buffer.from("a", "utf8") },
		{ name: "b.xml", data: Buffer.from("bb", "utf8") },
	]);
	// The EOCD record is fixed-size (22 bytes) with no comment written.
	const eocdOffset = zip.length - 22;
	assert.equal(zip.readUInt32LE(eocdOffset), END_OF_CENTRAL_DIRECTORY_SIGNATURE);
	const totalEntries = zip.readUInt16LE(eocdOffset + 10);
	const centralDirectorySize = zip.readUInt32LE(eocdOffset + 12);
	const centralDirectoryOffset = zip.readUInt32LE(eocdOffset + 16);
	assert.equal(totalEntries, 2);
	assert.equal(zip.readUInt32LE(centralDirectoryOffset), CENTRAL_DIRECTORY_SIGNATURE);
	assert.equal(centralDirectoryOffset + centralDirectorySize, eocdOffset, "central directory must run exactly up to the EOCD record");
});

test("an empty entry list still produces a valid (empty) archive", () => {
	const zip = createZip([]);
	assert.equal(zip.length, 22, "just the end-of-central-directory record");
	assert.equal(zip.readUInt32LE(0), END_OF_CENTRAL_DIRECTORY_SIGNATURE);
	assert.equal(zip.readUInt16LE(10), 0);
});
