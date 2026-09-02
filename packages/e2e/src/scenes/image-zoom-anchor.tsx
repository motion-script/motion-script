import { createRef, Image, easeInOut } from 'motion-script';
import { scene } from './_chain';
import { holdTail } from './_lib';

/**
 * `zoom` + `anchor` — a Ken Burns push. `zoom` multiplies whatever scale `fit`
 * resolved, and `anchor` names the point of the source that stays pinned to the
 * same point of the box, so the magnification grows away from *it* rather than
 * from the centre. The anchor here sits on the bird's head (left of centre,
 * above the middle), so the head holds its place in frame while everything
 * around it expands past the edges.
 */
const photo = createRef<Image>();
export default scene((stage) => {
    stage.set({ fill: 'bg' });

    stage.add(
        <Image
            ref={photo}
            src="kingfisher.jpg"
            width={520}
            height={380}
            cornerRadius={20}
            anchor={{ x: -0.16, y: 0.24 }}
            stroke={{ weight: 3, fill: 'primary' }}
        />,
    );
}, [
    () => photo().to({ zoom: 2.4 }, 1.4, easeInOut('cubic')),
    holdTail(1.4),
]);
