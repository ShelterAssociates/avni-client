// The slum file on disk is the map's only source, so these tests run against a real filesystem:
// the point is that the newest download always replaces it and that a failed one never loses it.
jest.mock('react-native-fs', () => {
    const nodeFs = require('fs');
    const nodePath = require('path');
    const root = nodePath.join(require('os').tmpdir(), 'avni-gis-sync-test');
    const state = {failNextWrite: false};
    return {
        __root: root,
        __state: state,
        DocumentDirectoryPath: root,
        exists: p => Promise.resolve(nodeFs.existsSync(p)),
        mkdir: p => Promise.resolve(nodeFs.mkdirSync(p, {recursive: true})),
        readFile: p => Promise.resolve(nodeFs.readFileSync(p, 'utf8')),
        writeFile: (p, text) => {
            if (state.failNextWrite) {
                state.failNextWrite = false;
                return Promise.reject(new Error('ENOSPC: no space left on device'));
            }
            return Promise.resolve(nodeFs.writeFileSync(p, text));
        },
        moveFile: (from, to) => Promise.resolve(nodeFs.renameSync(from, to)),
        unlink: p => Promise.resolve(nodeFs.rmSync(p, {force: true})),
        stat: p => Promise.resolve({mtime: nodeFs.statSync(p).mtime}),
    };
});

import {assert} from 'chai';
import nodeFs from 'fs';
import RNFS from 'react-native-fs';
import GisSyncService from '../../src/service/GisSyncService';
import GisConfig from '../../src/gis/GisConfig';

const UUID = 'slum-uuid-1';
const GIS_DIR = `${RNFS.__root}/gis`;
const destPath = GisSyncService.slumFilePath(UUID);
const backupPath = `${destPath}.bak`;

function collection(numbers, {boundary = {type: 'Polygon', coordinates: [[[0, 0]]]}} = {}) {
    return {
        type: 'FeatureCollection',
        boundary,
        map_registration_subject_types: ['Household'],
        features: numbers.map(s => ({type: 'Feature', geometry: {type: 'Polygon', coordinates: [[[0, 0]]]}, properties: {s}})),
    };
}

function respondWith(body, {ok = true, status = 200} = {}) {
    global.fetch = jest.fn(() => Promise.resolve({
        ok, status, text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    }));
}

function savedNumbers() {
    return JSON.parse(nodeFs.readFileSync(destPath, 'utf8')).features.map(f => f.properties.s);
}

describe('GisSyncService.downloadStructuresForSlum', () => {
    beforeEach(() => {
        nodeFs.rmSync(RNFS.__root, {recursive: true, force: true});
        nodeFs.mkdirSync(GIS_DIR, {recursive: true});
        RNFS.__state.failNextWrite = false;
        GisConfig.override({GIS_SERVER_URL: 'http://gis.example.org', GIS_API_KEY: 'key'});
    });

    afterEach(() => {
        GisConfig.override(null);
        delete global.fetch;
    });

    it('writes the slum file on the first sync', async () => {
        respondWith(collection(['1', '2', '3']));
        assert.isTrue(await GisSyncService.downloadStructuresForSlum(UUID, 'Test Slum'));
        assert.deepEqual(savedNumbers(), ['1', '2', '3']);
        assert.isFalse(nodeFs.existsSync(backupPath));
    });

    it('replaces the saved file whenever the latest sync differs - deleted, renumbered or moved', async () => {
        respondWith(collection(['1', '2', '3']));
        await GisSyncService.downloadStructuresForSlum(UUID, 'Test Slum');

        respondWith(collection(['1', '3A']));
        assert.isTrue(await GisSyncService.downloadStructuresForSlum(UUID, 'Test Slum'));
        assert.deepEqual(savedNumbers(), ['1', '3A']);
        assert.isFalse(nodeFs.existsSync(backupPath));
    });

    it('replaces it even when the slum has no structures left', async () => {
        respondWith(collection(['1', '2']));
        await GisSyncService.downloadStructuresForSlum(UUID, 'Test Slum');

        respondWith(collection([]));
        assert.isTrue(await GisSyncService.downloadStructuresForSlum(UUID, 'Test Slum'));
        assert.deepEqual(savedNumbers(), []);
    });

    it('keeps the saved file when the server answers with something that is not a slum file', async () => {
        respondWith(collection(['1', '2']));
        await GisSyncService.downloadStructuresForSlum(UUID, 'Test Slum');

        respondWith({error: 'no slum is mapped to avni_uuid slum-uuid-1'});
        assert.isFalse(await GisSyncService.downloadStructuresForSlum(UUID, 'Test Slum'));
        assert.deepEqual(savedNumbers(), ['1', '2']);
        assert.isFalse(nodeFs.existsSync(backupPath));
    });

    it('keeps the saved file when the download fails', async () => {
        respondWith(collection(['1', '2']));
        await GisSyncService.downloadStructuresForSlum(UUID, 'Test Slum');

        respondWith('<html>502 Bad Gateway</html>', {ok: false, status: 502});
        assert.isFalse(await GisSyncService.downloadStructuresForSlum(UUID, 'Test Slum'));
        assert.deepEqual(savedNumbers(), ['1', '2']);
    });

    it('restores the saved file when the new one cannot be written', async () => {
        respondWith(collection(['1', '2']));
        await GisSyncService.downloadStructuresForSlum(UUID, 'Test Slum');

        respondWith(collection(['9']));
        RNFS.__state.failNextWrite = true;
        assert.isFalse(await GisSyncService.downloadStructuresForSlum(UUID, 'Test Slum'));
        assert.deepEqual(savedNumbers(), ['1', '2']);
        assert.isFalse(nodeFs.existsSync(backupPath));
    });

    it('recovers a backup left behind by a sync that was killed mid-write', async () => {
        nodeFs.writeFileSync(backupPath, JSON.stringify(collection(['1', '2'])));
        respondWith('', {ok: false, status: 500});

        assert.isFalse(await GisSyncService.downloadStructuresForSlum(UUID, 'Test Slum'));
        assert.deepEqual(savedNumbers(), ['1', '2']);
        assert.isFalse(nodeFs.existsSync(backupPath));
    });

    it('drops a stale backup when the saved file is already there', async () => {
        respondWith(collection(['1']));
        await GisSyncService.downloadStructuresForSlum(UUID, 'Test Slum');
        nodeFs.writeFileSync(backupPath, 'stale');

        respondWith(collection(['2']));
        assert.isTrue(await GisSyncService.downloadStructuresForSlum(UUID, 'Test Slum'));
        assert.deepEqual(savedNumbers(), ['2']);
        assert.isFalse(nodeFs.existsSync(backupPath));
    });
});
