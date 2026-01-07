import React from "react"
import {Button} from "react-bootstrap"

class Build extends React.Component{

  constructor(props){
    super(props)
    this.handleClick = this.handleClick.bind(this)
  }

  handleClick(){
    const p = this.props
    if (p.property){
      p.player.developProperty(p.property)
    }
  }


  render(){
    return(
      <div className="build-button-div">
        <Button onClick={this.handleClick}>Build House</Button>
      </div>
    )
  }

}

export default Build