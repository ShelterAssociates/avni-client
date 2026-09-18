import RNFS from 'react-native-fs';
import General from '../utility/General';

const GIS_SERVER = 'http://localhost:8000';
const GIS_DIR = `${RNFS.DocumentDirectoryPath}/gis`;

class GisSyncService {
    static async syncGisData(addressLevelService) {
        try {
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
        const url = `${GIS_SERVER}/component/get_structures_for_avni/?avni_uuid=${avniUuid}&slum_name=${encodeURIComponent(slumName)}`;
        const destPath = `${GIS_DIR}/structures_${avniUuid}.json`;

        General.logInfo('GisSyncService', `Downloading GIS for slum: ${slumName}`);

        const response = await fetch(url);
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