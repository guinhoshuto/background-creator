import {Config} from '@remotion/cli/config';

// The Node exporter passes its own settings; this file applies to Studio/CLI.
Config.setVideoImageFormat('png');
Config.setOverwriteOutput(false);
