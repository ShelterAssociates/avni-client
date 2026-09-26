import _ from "lodash";
import {Privilege, SubjectType, WorkList, WorkLists} from "avni-models";
import AddressLevelService from "../service/AddressLevelService";
import EntityService from "../service/EntityService";
import FormMappingService from "../service/FormMappingService";
import PrivilegeService from "../service/PrivilegeService";
import GroupSubjectService from "../service/GroupSubjectService";
import CHSNavigator from "../utility/CHSNavigator";
import Reducers from "../reducer";
import {mapEntry} from "./mapEntry";
import {ensureMapRegistrationSubjectTypes, mapRegistrationSubjectTypes, registrationUsesMap} from "./mapRegistrationForms";

export function registrableSubjectTypes(context) {
    const privilegeService = context.getService(PrivilegeService);
    const criteria = `privilege.name = '${Privilege.privilegeName.registerSubject}' AND privilege.entityType = '${Privilege.privilegeEntityType.subject}'`;
    const allowed = privilegeService.allowedEntityTypeUUIDListForCriteria(criteria, 'subjectTypeUuid');
    const formMappingService = context.getService(FormMappingService);
    return context.getService(EntityService).findAllByCriteria('voided = false AND active = true', SubjectType.schema.name)
        .filter(st => (privilegeService.hasAllPrivileges() || _.includes(allowed, st.uuid)) && formMappingService.findRegistrationForm(st));
}

// What the Register page offers: each subject type, then its programs when the user registers-and-enrols.
export function registrationChoices(context, I18n, includePrograms) {
    const privilegeService = context.getService(PrivilegeService);
    const formMappingService = context.getService(FormMappingService);
    return _.flatMap(_.sortBy(registrableSubjectTypes(context), ({name}) => I18n.t(name)), subjectType => {
        const enrolCriteria = `privilege.name = '${Privilege.privilegeName.enrolSubject}' AND privilege.entityType = '${Privilege.privilegeEntityType.enrolment}' AND subjectTypeUuid = '${subjectType.uuid}'`;
        const allowed = privilegeService.allowedEntityTypeUUIDListForCriteria(enrolCriteria, 'programUuid');
        const programs = includePrograms
            ? formMappingService.findActiveProgramsForSubjectType(subjectType).filter(p => privilegeService.hasAllPrivileges() || _.includes(allowed, p.uuid))
            : [];
        return [
            {key: subjectType.uuid, label: I18n.t(subjectType.name), subjectType, program: null},
            ...programs.map(program => ({key: `${subjectType.uuid}/${program.uuid}`, label: I18n.t(`REG_ENROL_DISPLAY-${program.programSubjectLabel}`), subjectType, program})),
        ];
    });
}

export function workListsFor({subjectType, program, label}, context) {
    const workList = new WorkList(label).withRegistration(subjectType.name);
    if (program) return new WorkLists(workList.withEnrolment(program.name));
    if (subjectType.isHousehold()) {
        const groupRole = context.getService(GroupSubjectService).getGroupRoles(subjectType)[0];
        workList.withHouseholdRegistration({subjectTypeName: _.get(groupRole, 'memberSubjectType.name'), saveAndProceedLabel: 'registerHeadOfFamily', headOfHousehold: true});
    }
    return new WorkLists(workList);
}

export function mapAvailable(context) {
    return mapEntry(context.getService(AddressLevelService)).available
        && _.some(registrableSubjectTypes(context), ({name}) => registrationUsesMap(name, mapRegistrationSubjectTypes()));
}

// Querying rows a sync reset is deleting faults inside Realm's mmap, so answer from cache while syncing.
// The home screen re-renders on every sync message, so the answer is also kept until a sync can change it.
export function mapAvailableDuringRender(view) {
    const syncState = view.getContextState(Reducers.reducerKeys.syncComponentAction);
    if (syncState && (syncState.syncing || syncState.backgroundSyncInProgress)) {
        view._mapAvailableStale = true;
        return view._mapAvailable === true;
    }
    if (_.isNil(mapRegistrationSubjectTypes())) {
        ensureMapRegistrationSubjectTypes(() => view.setState({}));
        return false;
    }
    if (_.isNil(view._mapAvailable) || view._mapAvailableStale) {
        view._mapAvailable = mapAvailable(view.context);
        view._mapAvailableStale = false;
    }
    return view._mapAvailable;
}

// Browse the slum map for one registration choice; picking an empty house starts that registration.
export function openMapBrowser(source, choice) {
    const {context} = source;
    const {slums} = mapEntry(context.getService(AddressLevelService));
    CHSNavigator.navigateToMapPicker(source, {slums, initialSlumUuid: slums[0].uuid, subjectTypeName: choice.subjectType.name, mode: 'browse'},
        (structureId, _existingUuid, slumUuid, extra) =>
            CHSNavigator.navigateToRegisterView(source, {mapStructure: structureId ? {structureId, slumUuid, extra} : null, workLists: workListsFor(choice, context)}));
}
