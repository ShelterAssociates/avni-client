import RNFS from 'react-native-fs';
import General from '../utility/General';
import GisConfig from '../gis/GisConfig';
import {isStructureCollection, slumFileName} from '../gis/gisFile';
import GisMappingQueue from '../gis/GisMappingQueue';
import {saveMapRegistrationSubjectTypes} from '../gis/mapRegistrationForms';

const GIS_DIR = `${RNFS.DocumentDirectoryPath}/gis`;

class GisSyncService {
    static slumFilePath(avniUuid) {
        return `${GIS_DIR}/${slumFileName(avniUuid)}`;
    }

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
        const destPath = GisSyncService.slumFilePath(avniUuid);
        const backupPath = `${destPath}.bak`;

        General.logInfo('GisSyncService', `Downloading GIS for slum: ${slumName}`);
        await GisSyncService.recoverBackup(destPath, backupPath);

        try {
            const response = await GisConfig.fetch(path);
            if (!response.ok) {
                General.logWarn('GisSyncService', `GIS fetch failed for ${slumName}: HTTP ${response.status}`);
                return false; // keep whatever was downloaded last time
            }
            const text = await response.text();
            const next = JSON.parse(text);
            if (!isStructureCollection(next)) {
                General.logWarn('GisSyncService', `GIS for ${slumName} is not a structure collection; keeping the saved copy`);
                return false;
            }
            await GisSyncService.replaceSlumFile(destPath, backupPath, text);
            await saveMapRegistrationSubjectTypes(next.map_registration_subject_types);
            General.logInfo('GisSyncService', `GIS saved for ${slumName}: ${next.features.length} structures, boundary ${next.boundary ? 'yes' : 'no'}`);
            return true;
        } catch (e) {
            General.logWarn('GisSyncService', `GIS download failed for ${slumName}: ${e.message}`);
            return false;
        }
    }

    // The old file is renamed aside rather than copied (a rename costs nothing, a copy of a 5 MB
    // slum does) and dropped once the new one is on disk, so a failed write never loses it.
    static async replaceSlumFile(destPath, backupPath, text) {
        if (await RNFS.exists(destPath)) await RNFS.moveFile(destPath, backupPath);
        try {
            await RNFS.writeFile(destPath, text, 'utf8');
        } catch (e) {
            await GisSyncService.recoverBackup(destPath, backupPath);
            throw e;
        }
        if (await RNFS.exists(backupPath)) await RNFS.unlink(backupPath);
    }

    // A sync killed mid-write leaves the backup behind: it is the good copy when the new file
    // never landed, and dead weight once it did.
    static async recoverBackup(destPath, backupPath) {
        if (!(await RNFS.exists(backupPath))) return;
        if (await RNFS.exists(destPath)) {
            await RNFS.unlink(backupPath);
        } else {
            General.logWarn('GisSyncService', `Restoring ${backupPath} left behind by an interrupted sync`);
            await RNFS.moveFile(backupPath, destPath);
        }
    }

    static async hasLocalData(avniUuid) {
        return await RNFS.exists(GisSyncService.slumFilePath(avniUuid));
    }

    static async clearAll() {
        const exists = await RNFS.exists(GIS_DIR);
        if (exists) await RNFS.unlink(GIS_DIR);
    }
}

export default GisSyncService;
