export interface ICharacterLike {
	create(centerXView?: number): boolean | void;
	resize(centerXView?: number): void;
	destroy(): void;
	setVisible?(visible: boolean): void;
}
