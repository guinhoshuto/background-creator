import {Children, isValidElement, type ReactElement, type ReactNode} from 'react';

/** Finds a <Composition> by id anywhere under the Studio root, looking through <Folder> children. */
export const findComposition = <Props extends {id: string}>(node: ReactNode, id: string): ReactElement<Props> | undefined => {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{id?: string; children?: ReactNode}>(child)) continue;
    if (child.props.id === id) return child as ReactElement<Props>;
    const found = findComposition<Props>(child.props.children, id);
    if (found) return found;
  }
  return undefined;
};

/** The Studio folder path ("a/b") holding a composition; "" at the root, undefined when absent. */
export const folderOf = (node: ReactNode, id: string, parent = ''): string | undefined => {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{id?: string; name?: string; children?: ReactNode}>(child)) continue;
    if (child.props.id === id) return parent;
    const {name} = child.props;
    const nested = folderOf(child.props.children, id, typeof name === 'string' ? (parent ? `${parent}/${name}` : name) : parent);
    if (nested !== undefined) return nested;
  }
  return undefined;
};
