import RNFS from 'react-native-fs';
import General from '../utility/General';
import GisConfig from '../gis/GisConfig';
import {keepsMoreMapData} from '../gis/gisFile';
import GisMappingQueue from '../gis/GisMappingQueue';
import {saveMapRegistrationSubjectTypes} from '../gis/mapRegistrationForms';

const GIS_DIR = `${RNFS.DocumentDirectoryPath}/gis`;

class GisSyncService {
    // onMessage(text) receives one-line progress for the sync screen, e.g.
    // "Downloading map 2/4: Baliram Nagar". Optional.
    static async syncGisData(addressLevelService, onMessage = () => {}) {
        try {
            if (!GisConfig.isConfigured()) {
                General.logWarn('GisSyncService', 'GIS_SERVER_URL / GIS_API_KEY not set in Config.js; skipping GIS sync');
                return;
            }
            General.logInfo('GisSyncService', 'Starting GIS sync');
            onMessage('Sending household ↔ structure links to GIS');
            const flushed = await GisMappingQueue.flush();
            General.logInfo('GisSyncService', `Structure mappings: sent ${flushed.sent}, dropped ${flushed.dropped}, still queued ${flushed.kept}`);
            if (flushed.kept > 0) onMessage(`${flushed.kept} household ↔ structure link(s) still waiting for the GIS server`);
            const dirExists = await RNFS.exists(GIS_DIR);
            if (!dirExists) await RNFS.mkdir(GIS_DIR);

            const allAddressLevels = addressLevelService.findAll('AddressLevel');
            const slums = [...allAddressLevels].filter(a => a.type === 'Slum' && !a.voided);
            let failed = 0;
            for (let i = 0; i < slums.length; i++) {
                const slum = slums[i];
                onMessage(`Downloading map ${i + 1}/${slums.length}: ${slum.name}`);
                const ok = await GisSyncService.downloadStructuresForSlum(slum.uuid, slum.name);
                if (!ok) failed++;
            }
            onMessage(failed === 0
                ? `Maps updated for ${slums.length} slum(s)`
                : `Maps updated for ${slums.length - failed} of ${slums.length} slum(s); ${failed} could not be downloaded`);

        } catch (e) {
            General.logError('GisSyncService', e);
        }
    }

    static async downloadStructuresForSlum(avniUuid, slumName) {
        const path = `/component/get_structures_for_avni/?avni_uuid=${avniUuid}`;
        const destPath = `${GIS_DIR}/structures_${avniUuid}.json`;

        General.logInfo('GisSyncService', `Downloading GIS for slum: ${slumName}`);

        try {
            const response = await GisConfig.fetch(path);
            if (!response.ok) {
                General.logWarn('GisSyncService', `GIS fetch failed for ${slumName}: HTTP ${response.status}`);
                return false; // keep whatever was downloaded last time
            }
            const text = await response.text();
            const next = JSON.parse(text);
            const previous = (await RNFS.exists(destPath)) ? JSON.parse(await RNFS.readFile(destPath, 'utf8')) : null;
            if (!keepsMoreMapData(previous, next)) {
                General.logWarn('GisSyncService', `GIS for ${slumName} came back with less data than saved; keeping the saved copy`);
                return false;
            }
            await RNFS.writeFile(destPath, text, 'utf8');
            await saveMapRegistrationSubjectTypes(next.map_registration_subject_types);
            General.logInfo('GisSyncService', `GIS saved for ${slumName}: ${(next.features || []).length} structures, boundary ${next.boundary ? 'yes' : 'no'}`);
            return true;
        } catch (e) {
            General.logWarn('GisSyncService', `GIS download failed for ${slumName}: ${e.message}`);
            return false;
        }
    }

    // Used by MapPickerScreen to load structures offline
    // static async loadStructures(avniUuid) {
    //     const path = `${GIS_DIR}/structures_${avniUuid}.json`;
    //     const exists = await RNFS.exists(path);
    //     if (!exists) return null;
    //     const raw = await RNFS.readFile(path, 'utf8');
    //     return JSON.parse(raw);
    // }

    static async hasLocalData(avniUuid) {
        return await RNFS.exists(`${GIS_DIR}/structures_${avniUuid}.json`);
    }

    static async clearAll() {
        const exists = await RNFS.exists(GIS_DIR);
        if (exists) await RNFS.unlink(GIS_DIR);
    }
}

export default GisSyncService;