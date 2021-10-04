"use strict";

import * as Summary from "./Summary";

/**
 * Common properties, loaded from miscellaneous sources.
 */
export interface Props {
    errors: Summary.ProblemMessage[];
    // jumpToStep injected by StepZilla parent
    jumpToStep?: (index: number) => void;
    onAck: (category: string) => void;
    onUpdate: (step: string, stepState: any, callback?: () => void) => void;
    statusProps: Summary.StatusProps;
    warnings: Summary.ProblemMessage[];
}

/**
 * Static "string" props loaded from base template at startup.
 */
export interface Strings {
    ackButtonLabel: string;
    title: string;
}
