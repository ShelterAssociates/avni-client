import RNFS from 'react-native-fs';
import General from '../utility/General';
import GisConfig from '../gis/GisConfig';

const GIS_DIR = `${RNFS.DocumentDirectoryPath}/gis`;

class GisSyncService {
    static async syncGisData(addressLevelService) {
        try {
            if (!GisConfig.isConfigured()) {
                General.logWarn('GisSyncService', 'GIS_SERVER_URL / GIS_API_KEY not set in Config.js; skipping GIS sync');
                return;
            }
            General.logInfo('GisSyncService', 'Starting GIS sync');
            const dirExists = await RNFS.exists(GIS_DIR);
            if (!dirExists) await RNFS.mkdir(GIS_DIR);

            const allAddressLevels = addressLevelService.findAll('AddressLevel');
            const slums = [...allAddressLevels].filter(a => a.type === 'Slum' && !a.voided);
            for (const slum of slums) {
                await GisSyncService.downloadStructuresForSlum(slum.uuid, slum.name);
            }

        } catch (e) {
            General.logError('GisSyncService', e);
        }
    }

    static async downloadStructuresForSlum(avniUuid, slumName) {
        const path = `/component/get_structures_for_avni/?avni_uuid=${avniUuid}`;
        const destPath = `${GIS_DIR}/structures_${avniUuid}.json`;

        General.logInfo('GisSyncService', `Downloading GIS for slum: ${slumName}`);

        const response = await GisConfig.fetch(path);
        if (!response.ok) {
            General.logWarn('GisSyncService', `GIS fetch failed for ${slumName}: HTTP ${response.status}`);
            return; // skip this slum, don't crash
        }

        const text = await response.text();

        // Basic validation — make sure it's valid JSON before saving
        JSON.parse(text);

        await RNFS.writeFile(destPath, text, 'utf8');
        General.logInfo('GisSyncService', `GIS saved for ${slumName} at ${destPath}`);
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