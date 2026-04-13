// React 19 호환성 패치
// react-markdown v8 등 구버전 라이브러리가 JSX 글로벌 네임스페이스를 참조할 때 발생하는 오류 해결
// React 19에서 JSX 글로벌 네임스페이스가 제거되었으므로 명시적으로 선언한다
declare global {
  namespace JSX {
    type Element = React.ReactElement;
    type IntrinsicElements = React.JSX.IntrinsicElements;
    type ElementAttributesProperty = React.JSX.ElementAttributesProperty;
    type ElementChildrenAttribute = React.JSX.ElementChildrenAttribute;
    type LibraryManagedAttributes<C, P> = React.JSX.LibraryManagedAttributes<C, P>;
    type IntrinsicAttributes = React.JSX.IntrinsicAttributes;
    type IntrinsicClassAttributes<T> = React.JSX.IntrinsicClassAttributes<T>;
    type ElementType = React.JSX.ElementType;
  }
}

export {};
