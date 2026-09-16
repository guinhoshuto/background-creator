import type {ReactNode} from 'react';
import {AbsoluteFill} from 'remotion';
import {hasTransparentBackground, type BaseBackgroundProps} from '../settings';

export const Canvas = ({
  children,
  ...props
}: BaseBackgroundProps & {children: ReactNode}) => (
  <AbsoluteFill
    style={{
      backgroundColor: hasTransparentBackground(props) ? 'transparent' : props.backgroundColor,
      overflow: 'hidden',
    }}
  >
    {children}
  </AbsoluteFill>
);
