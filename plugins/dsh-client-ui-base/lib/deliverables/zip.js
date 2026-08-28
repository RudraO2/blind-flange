/**
 * A minimal ZIP writer, dependency-free.
 *
 * Story 5.4 needs a real `.docx` — an OOXML package, which is a ZIP archive —
 * and every JS zip library reachable from npm carries transitive dependencies
 * outside `docs/licence-policy.md`'s allow-list (ISC, Zlib, BlueOak-1.0.0,
 * checked against `docx`'s own tree before this file was written). Node's own
 * `node:zlib` exposes `deflateRawSync` and (since Node 20.12) `crc32`, which is
 * everything the ZIP format needs — so this writes the format directly rather
 * than adding a dependency. "Find a permissive equivalent" (licence-policy.md)
 * taken to its limit: the equivalent is zero dependencies.
 *
 * Deliberately narrow: one entry per call, DEFLATE compression, no Zip64, no
 * encryption, no directory entries, ASCII file names only — everything an
 * OOXML package actually needs and nothing an approval note does not.
 */

import { crc32, deflateRawSync } from "node:zlib";

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const VERSION_NEEDED = 20;
const DEFLATE_METHOD = 8;

/** DOS date/time fields packed the way a ZIP header stores them. */
function dosDateTime(date) {
	const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f);
	const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
	return { dosDate, dosTime };
}

/**
 * Build a ZIP archive from a flat list of entries.
 * @param {Array<{ name: string, data: Buffer }>} entries - archive-relative paths (forward slashes) and their content.
 * @param {Date} [date] - the mod time recorded for every entry; defaults to now.
 * @returns the complete archive as a Buffer.
 */
export function createZip(entries, date = new Date()) {
	const { dosDate, dosTime } = dosDateTime(date);
	const localParts = [];
	const centralParts = [];
	let offset = 0;

	for (const { name, data } of entries) {
		const nameBytes = Buffer.from(name, "ascii");
		const compressed = deflateRawSync(data);
		const crc = crc32(data);

		const localHeader = Buffer.alloc(30);
		localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0);
		localHeader.writeUInt16LE(VERSION_NEEDED, 4);
		localHeader.writeUInt16LE(0, 6); // general purpose flag
		localHeader.writeUInt16LE(DEFLATE_METHOD, 8);
		localHeader.writeUInt16LE(dosTime, 10);
		localHeader.writeUInt16LE(dosDate, 12);
		localHeader.writeUInt32LE(crc, 14);
		localHeader.writeUInt32LE(compressed.length, 18);
		localHeader.writeUInt32LE(data.length, 22);
		localHeader.writeUInt16LE(nameBytes.length, 26);
		localHeader.writeUInt16LE(0, 28); // extra field length

		localParts.push(localHeader, nameBytes, compressed);

		const centralHeader = Buffer.alloc(46);
		centralHeader.writeUInt32LE(CENTRAL_DIRECTORY_SIGNATURE, 0);
		centralHeader.writeUInt16LE(VERSION_NEEDED, 4); // version made by
		centralHeader.writeUInt16LE(VERSION_NEEDED, 6); // version needed
		centralHeader.writeUInt16LE(0, 8); // general purpose flag
		centralHeader.writeUInt16LE(DEFLATE_METHOD, 10);
		centralHeader.writeUInt16LE(dosTime, 12);
		centralHeader.writeUInt16LE(dosDate, 14);
		centralHeader.writeUInt32LE(crc, 16);
		centralHeader.writeUInt32LE(compressed.length, 20);
		centralHeader.writeUInt32LE(data.length, 24);
		centralHeader.writeUInt16LE(nameBytes.length, 28);
		centralHeader.writeUInt16LE(0, 30); // extra field length
		centralHeader.writeUInt16LE(0, 32); // file comment length
		centralHeader.writeUInt16LE(0, 34); // disk number start
		centralHeader.writeUInt16LE(0, 36); // internal file attributes
		centralHeader.writeUInt32LE(0, 38); // external file attributes
		centralHeader.writeUInt32LE(offset, 42); // local header offset

		centralParts.push(centralHeader, nameBytes);

		offset += localHeader.length + nameBytes.length + compressed.length;
	}

	const centralDirectory = Buffer.concat(centralParts);
	const centralDirectoryOffset = offset;

	const endRecord = Buffer.alloc(22);
	endRecord.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
	endRecord.writeUInt16LE(0, 4); // disk number
	endRecord.writeUInt16LE(0, 6); // disk with central directory
	endRecord.writeUInt16LE(entries.length, 8); // entries on this disk
	endRecord.writeUInt16LE(entries.length, 10); // total entries
	endRecord.writeUInt32LE(centralDirectory.length, 12);
	endRecord.writeUInt32LE(centralDirectoryOffset, 16);
	endRecord.writeUInt16LE(0, 20); // comment length

	return Buffer.concat([...localParts, centralDirectory, endRecord]);
}
