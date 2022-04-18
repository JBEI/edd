const preLogin = {
    url: "",
    actions: [],
};

const forgotPassword = {
    url: "/accounts/password/reset/",
    actions: [],
};

const signup = {
    url: "/accounts/signup",
    actions: [],
};

const login = {
    url: "",
    actions: [
        `set field #id_login to ${process.env.EDD_USERNAME}`,
        `set field #id_password to ${process.env.EDD_PASSWORD}`,
        "click element #id_click",
        "wait for path to be /",
    ],
};

const viewAddStudyPage = {
    url: "",
    actions: [...login.actions, "navigate to /study"],
};

const fillStudyPageForm = {
    url: "",
    actions: [
        ...viewAddStudyPage.actions,
        "set field #id_name to TestName",
        "set field #id_description to TestDescription",
    ],
};

const viewStudy = {
    url: "",
    actions: [
        ...login.actions,
        `navigate to ${process.env.EDD_HOMEPAGE_URL}${process.env.EDD_STUDY_URI}`,
    ],
};

const viewStudyOverview = {
    url: "",
    actions: [
        ...login.actions,
        `navigate to ${process.env.EDD_HOMEPAGE_URL}${process.env.EDD_STUDY_URI}overview`,
    ],
};

const viewStudyDescription = {
    url: "",
    actions: [
        ...login.actions,
        `navigate to ${process.env.EDD_HOMEPAGE_URL}${process.env.EDD_STUDY_URI}description`,
    ],
};

const viewStudyList = {
    url: "",
    actions: [...login.actions, "wait for element #studiesTable to be added"],
};

const exportData = {
    url: "",
    actions: [
        ...login.actions,
        `navigate to ${process.env.EDD_HOMEPAGE_URL}/export/table`,
    ],
};

const importData = {
    url: "",
    actions: [
        ...login.actions,
        `navigate to ${process.env.EDD_HOMEPAGE_URL}${process.env.EDD_IMPORT_DATA_URI}`,
    ],
};

const importUploadTab = {
    url: "",
    actions: [
        ...importData.actions,
        `wait for element #wizard>.multi-step>.stepDiv>fieldset>.multiSelect>button:last-child to be added`,
        `click element #wizard>.multi-step>.stepDiv>fieldset>.multiSelect>button:last-child`,
        `click element #next-button`,
        `wait for element #wizard>.multi-step>.stepDiv>.overviewDropZone to be added`,
    ],
};

const utilitiesProteomics = {
    url: "/utilities/proteomics",
    actions: [],
};

export default {
    exportData,
    fillStudyPageForm,
    forgotPassword,
    importData,
    importUploadTab,
    preLogin,
    signup,
    utilitiesProteomics,
    viewAddStudyPage,
    viewStudy,
    viewStudyDescription,
    viewStudyList,
    viewStudyOverview,
};
