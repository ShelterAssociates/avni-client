import AbstractComponent from "../framework/view/AbstractComponent";
import General from "../utility/General";
import {ActivityIndicator, InteractionManager, ScrollView, StyleSheet, Text, TouchableNativeFeedback, View} from "react-native";
import React from "react";
import CHSContainer from "./common/CHSContainer";
import AppHeader from "./common/AppHeader";
import CHSContent from "./common/CHSContent";
import {WorkList, WorkLists} from "avni-models";
import CHSNavigator from "../utility/CHSNavigator";
import Colors from "./primitives/Colors";
import _ from "lodash";
import Distances from "./primitives/Distances";
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Fonts from "./primitives/Fonts";
import AddressLevelService from "../service/AddressLevelService";
import UserInfoService from "../service/UserInfoService";
import DraftSubjectService from "../service/draft/DraftSubjectService";
import DraftConfigService from "../service/DraftConfigService";
import IndividualDetailsCard from "./common/IndividualDetailsCard";
import TypedTransition from "../framework/routing/TypedTransition";
import SubjectRegisterView from "./subject/SubjectRegisterView";
import PersonRegisterView from "./individual/PersonRegisterView";
import SubjectTypeIcon from "./common/SubjectTypeIcon";
import Separator from "./primitives/Separator";
import PropTypes from "prop-types";
import Styles from "./primitives/Styles";
import ContextAction from "./viewmodel/ContextAction";
import ObservationsSectionOptions from "./common/ObservationsSectionOptions";
import {mapEntry} from "../gis/mapEntry";
import {registrationChoices, workListsFor} from "../gis/mapBrowser";
import {loadMapRegistrationSubjectTypes, registrationUsesMap} from "../gis/mapRegistrationForms";

class RegisterView extends AbstractComponent {
    static propTypes = {
        hideBackButton: PropTypes.bool.isRequired,
        defaultObservations: PropTypes.any,
        taskUuid: PropTypes.string
    }

    constructor(props, context) {
        super(props, context);
        this.userSettings = context.getService(UserInfoService).getUserSettings();
        this.state = {mapRegistrationSubjectTypes: null};
    }

    UNSAFE_componentWillMount() {
        super.UNSAFE_componentWillMount();
        loadMapRegistrationSubjectTypes().then(names => this.setState({mapRegistrationSubjectTypes: names}));
    }

    _action(choice) {
        return {
            fn: () => this._navigateViaMap(choice.subjectType, (mapStructure) => CHSNavigator.navigateToRegisterView(this,
                {taskUuid: this.props.taskUuid, mapStructure, workLists: workListsFor(choice, this.context)})),
            label: choice.label,
            backgroundColor: choice.program ? choice.program.colour : Colors.AccentColor,
        };
    }

    // Shelter Associates GIS: route registration through the map picker (registered structures open
    // the household from the map itself); with no Slum synced the form opens directly, as upstream
    // does. navigateToForm receives {structureId, slumUuid}
    // (the structure number and the Avni uuid of the slum whose map it was picked from) or null.
    _navigateViaMap(subjectType, navigateToForm) {
        const {slums} = mapEntry(this.context.getService(AddressLevelService));
        if (_.isEmpty(slums) || !registrationUsesMap(subjectType.name, this.state.mapRegistrationSubjectTypes)) {
            navigateToForm(null);
            return;
        }
        const picker = {slums, initialSlumUuid: slums[0].uuid, subjectTypeName: subjectType.name};
        this.setState({openingMap: true}, () => {
            CHSNavigator.navigateToMapPicker(this, picker, (structureId, _existingUuid, slumUuid, extra) => navigateToForm(structureId ? {structureId, slumUuid, extra} : null));
            InteractionManager.runAfterInteractions(() => this.setState({openingMap: false}));
        });
    }

    renderOpeningMap() {
        return this.state.openingMap ? (
            <View style={styles.openingMap}>
                <ActivityIndicator size="large" color={Colors.AccentColor}/>
                <Text style={styles.openingMapText}>{this.I18n.t('openingMap')}</Text>
            </View>
        ) : null;
    }

    renderButton(onPress, buttonColor, text, textColor, index, subjectType, totalActions) {
        return (
            <View key={index}>
                <TouchableNativeFeedback onPress={() => {
                    onPress()
                }}>
                    <View style={{
                        marginRight: Distances.ScaledContentDistanceFromEdge,
                        marginLeft: Distances.ScaledContentDistanceFromEdge
                    }}>
                        <View style={[styles.container]}>
                            <SubjectTypeIcon style={{marginLeft: 8}} size={24} subjectType={subjectType}/>
                            <View style={[styles.textContainer]}>
                                <Text
                                    style={[Fonts.typography("paperFontSubhead"), styles.programNameStyle, {color: textColor}]}>{text}</Text>
                            </View>
                            <Icon style={styles.iconStyle} name='chevron-right'/>
                        </View>
                        {index + 1 !== totalActions &&
                            <Separator backgroundColor={Colors.InputBorderNormal} style={{marginHorizontal: 32}}/>
                        }
                    </View>
                </TouchableNativeFeedback>
            </View>
        );
    }

    deleteDraftSubject(uuid) {
        this.context.getService(DraftSubjectService).deleteDraftSubjectByUUID(uuid);
        this.setState({refresh: Date.now()});
    }

    openDraft(subject) {
        const subjectType = subject.subjectType;
        TypedTransition.from(this).with({
            subjectUUID: subject.uuid,
            individualUUID: subject.uuid,
            isDraftEntity: true,
            workLists: new WorkLists(new WorkList(this.I18n.t(`${subjectType.name}`)).withRegistration(subjectType.name))
        }).to(subjectType.isPerson() ? PersonRegisterView : SubjectRegisterView);
    }

    renderDraft(subject) {
        const actions = [
            new ContextAction(this.I18n.t('do'), () => this.openDraft(subject), Colors.ActionButtonColor)
        ];
        return (
            <View key={subject.uuid}>
                <TouchableNativeFeedback onPress={() => this.openDraft(subject)}>
                    <View>
                        <IndividualDetailsCard individual={subject} renderDraftString/>
                    </View>
                </TouchableNativeFeedback>
                <View style={{paddingHorizontal: 12, paddingBottom: 2, marginTop: -10}}>
                    <ObservationsSectionOptions
                        contextActions={actions}
                        primaryAction={new ContextAction(this.I18n.t('delete'), () => this.deleteDraftSubject(subject.uuid), Colors.ValidationError)}
                    />
                </View>
                <Separator backgroundColor={Colors.InputBorderNormal}/>
            </View>
        )
    }

    renderDrafts() {
        if (!this.context.getService(DraftConfigService).shouldDisplayDrafts()) {
            return null;
        }
        const draftSubjects = this.context.getService(DraftSubjectService).findAll().sorted('updatedOn', true);
        if (draftSubjects.length > 0) {
            return (
                <View style={styles.draftContainerStyle}>
                    <Text style={styles.draftHeaderStyle}>{this.I18n.t('drafts')}</Text>
                    <View style={styles.draftMessageContainer}>
                        <Text style={styles.draftMessageStyle}>{this.I18n.t('draftDeleteMessage')}</Text>
                    </View>
                    {_.map(draftSubjects, draftSubject => this.renderDraft(draftSubject.constructIndividual()))}
                </View>
            )
        }
    }

    render() {
        General.logDebug("RegisterView", "render");
        const actions = registrationChoices(this.context, this.I18n, this.userSettings.registerEnrol)
            .map(choice => ({action: this._action(choice), subjectType: choice.subjectType}));

        return (
            <CHSContainer style={{backgroundColor: Colors.GreyContentBackground, marginBottom: Styles.HeightOfBottomBar}}>
                <AppHeader title={this.I18n.t("register")} hideBackButton={this.props.hideBackButton} hideIcon={true}/>
                <CHSContent>
                    <ScrollView keyboardShouldPersistTaps="handled">
                        {_.map(actions, ({action, subjectType}, key) =>
                            this.renderButton(
                                action.fn,
                                action.backgroundColor || Colors.ActionButtonColor,
                                action.label,
                                Colors.InputNormal,
                                key,
                                subjectType,
                                _.size(actions)
                            )
                        )}
                        {this.renderDrafts()}
                    </ScrollView>
                </CHSContent>
                {this.renderOpeningMap()}
            </CHSContainer>
        );
    }
}

export default RegisterView

const styles = StyleSheet.create({
    openingMap: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', gap: 12},
    openingMapText: {color: Colors.TextOnPrimaryColor, fontSize: 16},
    container: {
        minHeight: 72,
        backgroundColor: Colors.cardBackgroundColor,
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
    },
    strip: {
        width: 8,
        height: '100%',
        backgroundColor: '#fefefe'
    },
    textContainer: {
        flex: 1,
        paddingVertical: 4,
        padding: Distances.ScaledContentDistanceFromEdge,
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    programNameStyle: {
        color: Colors.DefaultPrimaryColor,
        fontWeight: 'normal',
        fontSize: 20,
        alignSelf: 'flex-start',
        textAlignVertical: 'center',
    },
    iconStyle: {
        color: Colors.AccentColor,
        opacity: 0.8,
        alignSelf: 'center',
        fontSize: 40
    },
    draftContainerStyle: {
        marginTop: 16,
        marginBottom: 40,
        height: '100%',
        paddingVertical: 24,
    },
    draftMessageContainer: {
        elevation: 2,
        marginTop: 8,
        marginBottom: 4,
        flexWrap: 'wrap',
        minHeight: 20,
        width: '100%',
    },
    draftMessageStyle: {
        textAlign: 'left',
        fontStyle: 'italic',
        marginHorizontal: 12,
    },
    draftHeaderStyle: {
        marginHorizontal: 12,
        fontWeight: 'bold',
        fontSize: 20,
        color: Colors.DefaultPrimaryColor
    }
});
