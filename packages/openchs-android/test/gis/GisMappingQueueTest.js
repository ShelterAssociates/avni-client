import {assert} from "chai";

const mockFiles = {};
jest.mock("react-native-fs", () => ({
    DocumentDirectoryPath: "/doc",
    exists: jest.fn(path => Promise.resolve(path === "/doc/gis" || Object.prototype.hasOwnProperty.call(mockFiles, path))),
    mkdir: jest.fn(() => Promise.resolve()),
    readFile: jest.fn(path => Promise.resolve(mockFiles[path])),
    writeFile: jest.fn((path, content) => { mockFiles[path] = content; return Promise.resolve(); }),
}));
jest.mock("../../src/utility/General", () => ({logError: jest.fn(), logWarn: jest.fn(), logInfo: jest.fn()}));

import GisConfig from "../../src/gis/GisConfig";
import GisMappingQueue, {QUEUE_FILE} from "../../src/gis/GisMappingQueue";

const Config = {GIS_SERVER_URL: "http://gis", GIS_API_KEY: "k"};

const mapping = (n) => ({subjectUuid: `sub-${n}`, structureId: String(n), slumUuid: "slum-uuid"});
const queued = () => JSON.parse(mockFiles[QUEUE_FILE] || "[]").map(i => i.subjectUuid);

describe("GisMappingQueue", () => {
    beforeEach(() => {
        Object.keys(mockFiles).forEach(k => delete mockFiles[k]);
        Config.GIS_API_KEY = "k";
        GisConfig.override(Config);
        global.fetch = jest.fn(() => Promise.resolve({ok: true, status: 200}));
    });

    afterEach(() => GisConfig.override(null));

    it("persists before sending and clears the queue once the server accepts", async () => {
        const result = await GisMappingQueue.record(mapping(1));
        assert.deepEqual(result, {sent: 1, dropped: 0, kept: 0});
        assert.deepEqual(queued(), []);
        const [url, options] = global.fetch.mock.calls[0];
        assert.equal(url, "http://gis/component/map_subject_to_structure/");
        assert.deepEqual(JSON.parse(options.body), {subject_uuid: "sub-1", structure_id: "1", avni_uuid: "slum-uuid"});
        assert.equal(options.headers["X-Avni-Gis-Key"], "k");
    });

    it("keeps the mapping when the server is unreachable and sends it on the next flush", async () => {
        global.fetch = jest.fn(() => Promise.reject(new Error("Network request failed")));
        assert.deepEqual(await GisMappingQueue.record(mapping(1)), {sent: 0, dropped: 0, kept: 1});
        assert.deepEqual(queued(), ["sub-1"]);

        global.fetch = jest.fn(() => Promise.resolve({ok: true, status: 200}));
        assert.deepEqual(await GisMappingQueue.flush(), {sent: 1, dropped: 0, kept: 0});
        assert.deepEqual(queued(), []);
    });

    it("stops at the first transient failure so an unreachable server is hit once", async () => {
        await GisMappingQueue.enqueue(mapping(1));
        await GisMappingQueue.enqueue(mapping(2));
        await GisMappingQueue.enqueue(mapping(3));
        global.fetch = jest.fn(() => Promise.resolve({ok: false, status: 503}));
        assert.deepEqual(await GisMappingQueue.flush(), {sent: 0, dropped: 0, kept: 3});
        assert.equal(global.fetch.mock.calls.length, 1);
        assert.deepEqual(queued(), ["sub-1", "sub-2", "sub-3"]);
    });

    it("drops a mapping the server rejects outright and continues with the rest", async () => {
        await GisMappingQueue.enqueue(mapping(1));
        await GisMappingQueue.enqueue(mapping(2));
        global.fetch = jest.fn()
            .mockResolvedValueOnce({ok: false, status: 404})
            .mockResolvedValueOnce({ok: true, status: 200});
        assert.deepEqual(await GisMappingQueue.flush(), {sent: 1, dropped: 1, kept: 0});
        assert.deepEqual(queued(), []);
    });

    it("replaces an earlier unsent entry for the same subject", async () => {
        global.fetch = jest.fn(() => Promise.reject(new Error("offline")));
        await GisMappingQueue.record(mapping(1));
        await GisMappingQueue.record({...mapping(1), structureId: "9"});
        const items = JSON.parse(mockFiles[QUEUE_FILE]);
        assert.equal(items.length, 1);
        assert.equal(items[0].structureId, "9");
    });

    it("keeps everything and sends nothing when the GIS server is not configured", async () => {
        Config.GIS_API_KEY = "";
        assert.deepEqual(await GisMappingQueue.record(mapping(1)), {sent: 0, dropped: 0, kept: 1});
        assert.equal(global.fetch.mock.calls.length, 0);
    });

    it("starts empty when the queue file is corrupt", async () => {
        mockFiles[QUEUE_FILE] = "{not json";
        assert.deepEqual(await GisMappingQueue.load(), []);
    });
});
