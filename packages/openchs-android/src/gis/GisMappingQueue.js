// Durable queue for "subject X was registered on structure Y" notifications
// to the GIS server. Registrations usually happen offline, so the POST is
// queued on disk first and sent whenever there is a chance: right away, and
// again after every successful Avni sync (GisSyncService).
import RNFS from "react-native-fs";
import _ from "lodash";
import General from "../utility/General";
import GisConfig from "./GisConfig";

export const GIS_DIR = `${RNFS.DocumentDirectoryPath}/gis`;
export const QUEUE_FILE = `${GIS_DIR}/pending_mappings.json`;
export const MAPPING_PATH = "/component/map_subject_to_structure/";

// The server rejected the payload itself; retrying can never succeed.
const PERMANENT_FAILURE_STATUSES = [400, 404];

class GisMappingQueue {
    static async load() {
        try {
            if (!(await RNFS.exists(QUEUE_FILE))) return [];
            const items = JSON.parse(await RNFS.readFile(QUEUE_FILE, "utf8"));
            return _.isArray(items) ? items : [];
        } catch (e) {
            General.logError("GisMappingQueue", `Unreadable queue file, starting empty: ${e.message}`);
            return [];
        }
    }

    static async save(items) {
        if (!(await RNFS.exists(GIS_DIR))) await RNFS.mkdir(GIS_DIR);
        await RNFS.writeFile(QUEUE_FILE, JSON.stringify(items), "utf8");
    }

    // One entry per subject: a re-pick before the first successful send
    // replaces the earlier one.
    static async enqueue({subjectUuid, structureId, slumUuid}) {
        const items = (await GisMappingQueue.load()).filter(item => item.subjectUuid !== subjectUuid);
        items.push({subjectUuid, structureId, slumUuid, queuedAt: new Date().toISOString()});
        await GisMappingQueue.save(items);
        return items.length;
    }

    static async send(item) {
        return GisConfig.fetch(MAPPING_PATH, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                subject_uuid: item.subjectUuid,
                structure_id: item.structureId,
                avni_uuid: item.slumUuid,
            }),
        });
    }

    // Sends queued items in order. Stops at the first transient failure
    // (network, 5xx, 401/503 misconfiguration) so an unreachable server is
    // hit once, not once per item; permanent rejections are logged and dropped.
    static async flush() {
        const result = {sent: 0, dropped: 0, kept: 0};
        if (!GisConfig.isConfigured()) {
            result.kept = (await GisMappingQueue.load()).length;
            return result;
        }
        const items = await GisMappingQueue.load();
        const remaining = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (remaining.length > 0) {
                remaining.push(item);
                continue;
            }
            try {
                const response = await GisMappingQueue.send(item);
                if (response.ok) {
                    result.sent++;
                } else if (_.includes(PERMANENT_FAILURE_STATUSES, response.status)) {
                    General.logError("GisMappingQueue", `GIS rejected mapping ${item.subjectUuid} -> #${item.structureId} (HTTP ${response.status}); dropping it`);
                    result.dropped++;
                } else {
                    General.logWarn("GisMappingQueue", `GIS mapping ${item.subjectUuid} -> #${item.structureId} failed with HTTP ${response.status}; will retry after next sync`);
                    remaining.push(item);
                }
            } catch (e) {
                General.logWarn("GisMappingQueue", `GIS unreachable for mapping ${item.subjectUuid} -> #${item.structureId}: ${e.message}; will retry after next sync`);
                remaining.push(item);
            }
        }
        result.kept = remaining.length;
        if (remaining.length !== items.length) await GisMappingQueue.save(remaining);
        return result;
    }

    // Called from the registration save: persist first, then try to send.
    // Never throws — a GIS problem must not affect saving the household.
    static async record(mapping) {
        try {
            await GisMappingQueue.enqueue(mapping);
            return await GisMappingQueue.flush();
        } catch (e) {
            General.logError("GisMappingQueue", `Could not record mapping ${mapping.subjectUuid} -> #${mapping.structureId}: ${e.message}`);
            return null;
        }
    }
}

export default GisMappingQueue;
